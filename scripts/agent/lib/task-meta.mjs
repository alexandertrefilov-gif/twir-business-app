// scripts/agent/lib/task-meta.mjs
// Gemeinsamer Parser/Serializer für Task-Dateien unter .agent/**.
//
// Format: eine Markdown-Datei mit einem maschinenlesbaren JSON-Block
// (AGENT-META, als HTML-Kommentar — unsichtbar in jedem normalen Markdown-
// Viewer) gefolgt von einer für Menschen/Claude Code lesbaren Markdown-
// Sektion (CONTEXT, ACCEPTANCE_CRITERIA, ...). Der JSON-Block ist die
// alleinige Quelle der Wahrheit für alle skriptgesteuerten Felder (status,
// files_allowed, ...); kein YAML-Parser nötig, kein neuer Dependency.
//
// Siehe docs/agent/REQUIREMENT_FORMAT.md für die vollständige Feldliste.

import { readFileSync, writeFileSync } from 'node:fs'

const META_RE = /<!-- AGENT-META\n([\s\S]*?)\n-->/

export function readTask(filePath) {
  const raw = readFileSync(filePath, 'utf8')
  const match = raw.match(META_RE)
  if (!match) throw new Error(`Kein AGENT-META-Block gefunden in ${filePath}`)
  let meta
  try {
    meta = JSON.parse(match[1])
  } catch (error) {
    throw new Error(`AGENT-META in ${filePath} ist kein gültiges JSON: ${error.message}`)
  }
  const bodyStart = match.index + match[0].length
  const body = raw.slice(bodyStart)
  return { meta, body, raw, filePath }
}

// Regeneriert die für Menschen lesbare Statuszeile direkt unter dem
// AGENT-META-Block, damit niemand die JSON lesen muss, um Status/Priorität
// auf einen Blick zu sehen. Diese Zeile wird bei jedem writeTask()
// automatisch neu erzeugt — sie ist abgeleitet, nie die Quelle der Wahrheit.
const SUMMARY_RE = /^> \*\*Status:\*\*.*\n(\n)?/m

function summaryLine(meta) {
  return `> **Status:** ${meta.status} · **Priority:** ${meta.priority} · **Type:** ${meta.type} · **Repair-Versuche:** ${meta.repair_attempts ?? 0}/${meta.max_repair_attempts ?? 3}\n\n`
}

export function writeTask(task, filePath = task.filePath) {
  const metaBlock = `<!-- AGENT-META\n${JSON.stringify(task.meta, null, 2)}\n-->`
  let body = task.body.replace(SUMMARY_RE, '')
  if (!body.startsWith('\n')) body = `\n${body}`
  const content = `${metaBlock}\n${summaryLine(task.meta)}${body.trimStart()}\n`
  writeFileSync(filePath, content, 'utf8')
  return content
}

export const REQUIRED_FIELDS = [
  'id', 'title', 'status', 'priority', 'type', 'scope',
  'files_allowed', 'files_protected',
  'tests_required', 'db_test_required', 'playwright_required',
  'browser_qa_required', 'manual_approval_required',
  'report_format', 'created', 'max_repair_attempts', 'repair_attempts',
]

export const VALID_STATUSES = [
  'QUEUED', 'ACTIVE', 'BLOCKED', 'IMPLEMENTED', 'TEST_FAILED',
  'READY_FOR_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED',
]

export function validateTask(meta) {
  const errors = []
  for (const field of REQUIRED_FIELDS) {
    if (meta[field] === undefined || meta[field] === null) errors.push(`Pflichtfeld fehlt: ${field}`)
  }
  if (meta.status && !VALID_STATUSES.includes(meta.status)) {
    errors.push(`Ungültiger status "${meta.status}" — erlaubt: ${VALID_STATUSES.join(', ')}`)
  }
  if (meta.files_allowed && !Array.isArray(meta.files_allowed)) errors.push('files_allowed muss ein Array sein')
  if (meta.files_protected && !Array.isArray(meta.files_protected)) errors.push('files_protected muss ein Array sein')
  if (meta.tests_required && !Array.isArray(meta.tests_required)) errors.push('tests_required muss ein Array sein')
  if (typeof meta.db_test_required !== 'boolean') errors.push('db_test_required muss boolean sein')
  if (typeof meta.playwright_required !== 'boolean') errors.push('playwright_required muss boolean sein')
  if (typeof meta.manual_approval_required !== 'boolean') errors.push('manual_approval_required muss boolean sein')
  if (meta.files_allowed && meta.files_protected) {
    const overlap = meta.files_allowed.filter((f) => meta.files_protected.includes(f))
    if (overlap.length > 0) errors.push(`Datei(en) sowohl in files_allowed als auch files_protected: ${overlap.join(', ')}`)
  }
  return errors
}
