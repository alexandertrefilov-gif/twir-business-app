#!/usr/bin/env node
// scripts/agent/finish-task.mjs
// Schließt den aktiven Task ab: erzeugt den strukturierten Bericht unter
// .agent/reports/<ID>.md (+ latest.md/latest.json), verschiebt die
// Task-Datei nach .agent/completed/ (READY_FOR_REVIEW) oder
// .agent/failed/ (BLOCKED) und aktualisiert den AGENT-META-Block.
//
// Voraussetzung: Claude Code hat im Task-Body bereits eine
// "## REPORT"-Sektion mit den in docs/agent/DEVELOPMENT_PIPELINE.md
// genannten Pflichtfeldern ergänzt — dieses Skript erzeugt KEINEN
// narrativen Berichtstext selbst (das wäre nicht vertrauenswürdig, siehe
// Auftrag Abschnitt 6: "Keine bekannten Fehler als bestanden darstellen").
// Es übernimmt nur mechanisch ableitbare Fakten (Dateien, Gate-Ergebnisse)
// und die Datei-Verwaltung.
//
// Nutzung: npm run agent:finish

import { existsSync, readdirSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTask, writeTask } from './lib/task-meta.mjs'
import { gitDirtyPaths, fingerprintAll, resolveBaseline, diffFingerprints } from './lib/git-fingerprint.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const ACTIVE_DIR = join(REPO_ROOT, '.agent', 'active')
const COMPLETED_DIR = join(REPO_ROOT, '.agent', 'completed')
const FAILED_DIR = join(REPO_ROOT, '.agent', 'failed')
const REPORTS_DIR = join(REPO_ROOT, '.agent', 'reports')

function findActiveTask() {
  if (!existsSync(ACTIVE_DIR)) return null
  const files = readdirSync(ACTIVE_DIR).filter((f) => f.endsWith('.md'))
  if (files.length === 0) return null
  if (files.length > 1) throw new Error(`Mehr als ein aktiver Task gefunden: ${files.join(', ')}`)
  return { task: readTask(join(ACTIVE_DIR, files[0])), fileName: files[0] }
}

const found = findActiveTask()
if (!found) {
  console.error('Kein aktiver Task in .agent/active/.')
  process.exit(1)
}
const { task, fileName } = found

if (!/##\s*REPORT/i.test(task.body)) {
  console.error(`Task ${task.meta.id} hat noch keine "## REPORT"-Sektion im Body — finish-task erzeugt keinen Bericht ohne die von Claude Code verfassten narrativen Felder.`)
  console.error('Siehe docs/agent/DEVELOPMENT_PIPELINE.md für die Pflichtfelder.')
  process.exit(1)
}

const isBlocked = task.meta.status === 'BLOCKED'
const changedFiles = gitDirtyPaths(REPO_ROOT)

// PIPELINE-002: inhaltsbasierter Vergleich statt reinem Pfad-Vorhandensein
// — erkennt zusätzlich Änderungen an Dateien, die bereits VOR Aktivierung
// dieses Tasks dirty waren (baseline_git_status allein hätte diese nie
// gesehen, siehe .agent/completed/PIPELINE-002.md). Fingerprints werden
// über die Vereinigung aus Baseline-Pfaden und aktuell dirty-en Pfaden
// gebildet, damit auch eine seit Aktivierung verschwundene (z. B.
// zurückgesetzte) Baseline-Änderung als Abweichung sichtbar würde.
let newlyChangedFiles
if (task.meta.baseline_fingerprints) {
  const relevantPaths = [...new Set([...Object.keys(task.meta.baseline_fingerprints), ...changedFiles])]
  const resolvedBaseline = resolveBaseline(REPO_ROOT, task.meta.baseline_fingerprints, relevantPaths)
  const currentFingerprints = fingerprintAll(REPO_ROOT, relevantPaths)
  newlyChangedFiles = diffFingerprints(resolvedBaseline, currentFingerprints)
} else if (task.meta.baseline_git_status) {
  // Abwärtskompatibilität: Task wurde von einer älteren next-task.mjs-
  // Version ohne Fingerprints aktiviert — Fallback auf reinen Pfadvergleich
  // (erkennt keine Zusatzänderung an bereits vorher dirty-en Dateien).
  const baseline = new Set(task.meta.baseline_git_status)
  newlyChangedFiles = changedFiles.filter((f) => !baseline.has(f))
} else {
  // Kein Baseline-Snapshot vorhanden (z. B. Task von Hand aktiviert) —
  // voller Diff wird gewertet, kann unrelated Änderungen mitzählen.
  newlyChangedFiles = changedFiles
}

const allowed = new Set(task.meta.files_allowed ?? [])
const protectedFiles = new Set(task.meta.files_protected ?? [])
const touchedProtected = newlyChangedFiles.filter((f) => protectedFiles.has(f))
// files_allowed: [] bedeutet bewusst "keine Datei darf sich ändern"
// (strikter Read-Only-Scope), nicht "kein Scope-Check" — siehe
// docs/agent/REQUIREMENT_FORMAT.md.
const touchedOutsideScope = newlyChangedFiles.filter((f) => !allowed.has(f) && f !== fileName && !f.startsWith('.agent/'))

const reportHeader = `# Bericht ${task.meta.id}

**Erzeugt:** ${new Date().toISOString()}
**Endstatus:** ${isBlocked ? 'BLOCKED' : 'READY_FOR_REVIEW'}
**Repair-Versuche:** ${task.meta.repair_attempts ?? 0}/${task.meta.max_repair_attempts ?? 3}

## Automatisch ermittelte Fakten (nicht von Claude Code verfasst)

- FILES_CHANGED seit Task-Aktivierung (Baseline-Diff): ${newlyChangedFiles.length ? newlyChangedFiles.map((f) => `\`${f}\``).join(', ') : 'keine'}
- Dateien außerhalb FILES_ALLOWED geändert: ${touchedOutsideScope.length ? touchedOutsideScope.map((f) => `\`${f}\``).join(', ') : 'keine'}
- FILES_PROTECTED angetastet: ${touchedProtected.length ? `**JA — ${touchedProtected.map((f) => `\`${f}\``).join(', ')}**` : 'nein'}
- Gesamter uncommitted Diff des Arbeitsbaums (zur Einordnung, enthält ggf. unrelated Vorarbeit): ${changedFiles.length} Datei(en)
- PREEXISTING_FAILURES_PRESENT (PIPELINE-004): ${task.meta.last_gate_run?.preexisting_failures_present ? `**true** — ${(task.meta.last_gate_run.preexisting_failures ?? []).map((f) => `\`${f.file}\` → ${f.testName}`).join('; ')}` : 'false'}
- Letzter Gate-Lauf: ${task.meta.last_gate_run ? JSON.stringify(task.meta.last_gate_run, null, 2) : 'kein Gate-Lauf protokolliert'}

${touchedProtected.length ? '**WARNUNG: geschützte Datei(en) wurden verändert — vor Freigabe manuell prüfen.**\n' : ''}
## Bericht von Claude Code

`

const reportBody = task.body.slice(task.body.search(/##\s*REPORT/i)).replace(/^##\s*REPORT\s*\n?/i, '')

const reportContent = reportHeader + reportBody
const reportPath = join(REPORTS_DIR, `${task.meta.id}.md`)
writeFileSync(reportPath, reportContent, 'utf8')
writeFileSync(join(REPORTS_DIR, 'latest.md'), reportContent, 'utf8')
writeFileSync(join(REPORTS_DIR, 'latest.json'), JSON.stringify({
  id: task.meta.id,
  title: task.meta.title,
  status: isBlocked ? 'BLOCKED' : 'READY_FOR_REVIEW',
  finished_at: new Date().toISOString(),
  repair_attempts: task.meta.repair_attempts ?? 0,
  last_gate_run: task.meta.last_gate_run ?? null,
  preexisting_failures_present: task.meta.last_gate_run?.preexisting_failures_present ?? false,
  files_changed_since_activation: newlyChangedFiles,
  files_changed_full_worktree: changedFiles,
  files_outside_scope: touchedOutsideScope,
  files_protected_touched: touchedProtected,
  report_path: `.agent/reports/${task.meta.id}.md`,
}, null, 2), 'utf8')

task.meta.status = isBlocked ? 'BLOCKED' : 'READY_FOR_REVIEW'
task.meta.finished_at = new Date().toISOString()
task.meta.report_path = `.agent/reports/${task.meta.id}.md`

const targetDir = isBlocked ? FAILED_DIR : COMPLETED_DIR
const targetPath = join(targetDir, fileName)
writeTask(task, join(ACTIVE_DIR, fileName))
renameSync(join(ACTIVE_DIR, fileName), targetPath)

console.log(`Task ${task.meta.id} → ${task.meta.status}`)
console.log(`Bericht: ${reportPath}`)
console.log(`Task-Datei: ${targetPath}`)
if (touchedProtected.length) console.log(`\nWARNUNG: geschützte Dateien wurden verändert: ${touchedProtected.join(', ')}`)
if (!isBlocked) console.log('\nManuelles Approval Gate: Alex muss den Bericht prüfen und status auf APPROVED/REJECTED setzen (siehe docs/agent/APPROVAL_POLICY.md).')
