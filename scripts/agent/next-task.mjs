#!/usr/bin/env node
// scripts/agent/next-task.mjs
// Aktiviert den nächsten Task aus .agent/queue/ — Auswahl nach Priorität
// (P0 vor P1 vor P2 vor P3), bei Gleichstand nach "created" (älter zuerst).
// Verschiebt die Datei nach .agent/active/, setzt status=ACTIVE und
// started_at, und gibt den vollständigen Taskinhalt auf stdout aus, damit
// eine Claude-Code-Session (oder die twir-agent-pipeline-Skill) ihn direkt
// übernehmen kann.
//
// Nutzung: npm run agent:next
//
// WICHTIG: dieses Skript implementiert NICHTS selbst. Es wählt nur den
// nächsten Task aus und macht ihn "aktiv" — die eigentliche Umsetzung
// (lesen, implementieren, testen, reparieren, berichten) übernimmt Claude
// Code gemäß docs/agent/DEVELOPMENT_PIPELINE.md.

import { readdirSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { readTask, writeTask, validateTask } from './lib/task-meta.mjs'
import { gitDirtyPaths, fingerprintAll } from './lib/git-fingerprint.mjs'
import { runVitestWithFailureSignatures } from './lib/test-baseline.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const QUEUE_DIR = join(REPO_ROOT, '.agent', 'queue')
const ACTIVE_DIR = join(REPO_ROOT, '.agent', 'active')

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 }

function pickNext() {
  const files = readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.md'))
  const candidates = []
  for (const file of files) {
    const filePath = join(QUEUE_DIR, file)
    const task = readTask(filePath)
    if (task.meta.status !== 'QUEUED') continue
    const errors = validateTask(task.meta)
    if (errors.length > 0) {
      console.error(`ÜBERSPRUNGEN (ungültig): ${file}`)
      for (const error of errors) console.error(`  - ${error}`)
      continue
    }
    candidates.push({ file, filePath, task })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.task.meta.priority] ?? 99
    const pb = PRIORITY_ORDER[b.task.meta.priority] ?? 99
    if (pa !== pb) return pa - pb
    return String(a.task.meta.created).localeCompare(String(b.task.meta.created))
  })
  return candidates[0]
}

if (!existsSync(QUEUE_DIR) || readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.md')).length === 0) {
  console.log('Queue ist leer — kein Task zu aktivieren.')
  process.exit(0)
}

// Bereits aktiver Task blockiert next-task — kein zweiter gleichzeitig
// aktiver Task, um Datei-/Scope-Kollisionen zu vermeiden.
const activeFiles = existsSync(ACTIVE_DIR) ? readdirSync(ACTIVE_DIR).filter((f) => f.endsWith('.md')) : []
if (activeFiles.length > 0) {
  console.error(`Es ist bereits ein Task aktiv: .agent/active/${activeFiles[0]}`)
  console.error('Diesen zuerst abschließen (finish-task) oder manuell zurück in die Queue verschieben.')
  process.exit(1)
}

const picked = pickNext()
if (!picked) {
  console.log('Keine QUEUED-Tasks mit gültigem AGENT-META gefunden.')
  process.exit(0)
}

// Baseline-Snapshot des Arbeitsbaums bei Aktivierung — finish-task.mjs
// vergleicht damit, um NUR die während dieses Tasks tatsächlich
// geänderten Dateien zu erkennen, statt den gesamten (in dieser Session
// bereits vorhandenen, unrelated) uncommitted Diff fälschlich als
// Scope-Verletzung zu melden.
//
// PIPELINE-002: baseline_git_status (reine Pfadliste) erkennt nur NEU
// hinzukommende Pfade — eine Datei, die bereits vor Aktivierung dirty war,
// bleibt unsichtbar, selbst wenn der Task sie zusätzlich ändert (beide
// Zustände zeigen sich in `git status --short` identisch als "M"). Deshalb
// zusätzlich baseline_fingerprints: ein Inhalts-Hash je bereits dirty-em
// Pfad (Diff gegen HEAD bzw. Dateiinhalt bei untracked Dateien — siehe
// lib/git-fingerprint.mjs), gegen den finish-task.mjs den tatsächlichen
// Endstand vergleicht. baseline_git_status bleibt zusätzlich erhalten
// (menschlich lesbar, Abwärtskompatibilität für bereits aktive/ältere Tasks).
const baselineFiles = gitDirtyPaths(REPO_ROOT)
const baselineFingerprints = fingerprintAll(REPO_ROOT, baselineFiles)

// PIPELINE-004: Preexisting-Failure-Baseline — ein voller `vitest run`
// JETZT, VOR jeder Änderung durch diesen Task, damit run-gates.mjs später
// einen bereits vor Task-Aktivierung fehlschlagenden Test (z. B. das
// bekannte REQ-013-Problem) von einem tatsächlich neu/verändert
// eingeführten Fehler unterscheiden kann. Nutzt denselben `vitest run`
// wie agent:gates (kein neuer Testbefehl), nur zusätzlich mit
// JSON-Reporter für strukturierte Signaturen. Läuft IMMER mit — keine
// Sonderregel je Task-Typ (siehe docs/agent/TEST_POLICY.md).
//
// WICHTIG für DB-gekoppelte Tests (*-db.test.ts, race-condition.test.ts):
// diese Baseline ist nur dann für DB-Testfehler aussagekräftig, wenn
// TEST_DATABASE_URL bereits BEIM AUFRUF von `agent:next` gesetzt ist
// (genau wie bei `agent:gates`) — sonst laufen diese Dateien hier
// übersprungen statt fehlschlagend, und ein später real fehlschlagender
// DB-Test kann nie als PREEXISTING_FAILURE erkannt werden (siehe
// baseline_test_database_url_set unten, sicherheitsbewusst konservativ).
console.log('Erfasse Preexisting-Failure-Baseline (voller `vitest run`, siehe PIPELINE-004) …')
const baselineJsonPath = join(tmpdir(), `agent-baseline-${picked.task.meta.id}-${Date.now()}.json`)
const baselineTestRun = runVitestWithFailureSignatures(REPO_ROOT, [], baselineJsonPath)
if (!baselineTestRun.parsedOk) {
  console.warn('WARNUNG: Baseline-Testlauf lieferte kein auswertbares JSON-Ergebnis — spätere PREEXISTING_FAILURE-Klassifizierung fällt für diesen Task konservativ auf FAIL zurück.')
}
console.log(`Baseline: ${baselineTestRun.counts ? `${baselineTestRun.counts.failed} fehlgeschlagen / ${baselineTestRun.counts.passed} bestanden / ${baselineTestRun.counts.pending} übersprungen` : 'kein auswertbares Ergebnis'}${baselineTestRun.signatures.length ? ` — bekannte Fehlschläge: ${baselineTestRun.signatures.map((f) => f.key).join('; ')}` : ''}`)

picked.task.meta.status = 'ACTIVE'
picked.task.meta.started_at = new Date().toISOString()
picked.task.meta.baseline_git_status = baselineFiles
picked.task.meta.baseline_fingerprints = baselineFingerprints
picked.task.meta.baseline_test_failures = baselineTestRun.parsedOk ? baselineTestRun.signatures : null
picked.task.meta.baseline_test_run_at = new Date().toISOString()
picked.task.meta.baseline_test_database_url_set = !!process.env.TEST_DATABASE_URL
const newPath = join(ACTIVE_DIR, picked.file)
writeTask(picked.task, picked.filePath)
renameSync(picked.filePath, newPath)

console.log(`=== Task aktiviert: ${picked.task.meta.id} (${newPath}) ===\n`)
console.log(readTask(newPath).raw)
