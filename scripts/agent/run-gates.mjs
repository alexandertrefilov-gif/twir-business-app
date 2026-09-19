#!/usr/bin/env node
// scripts/agent/run-gates.mjs
// Führt die vorhandenen TWIR-Prüfbefehle für den aktiven Task aus
// (npm run typecheck / test:run / lint / build), wertet sie transparent
// aus und schreibt das Ergebnis in den AGENT-META-Block des aktiven Tasks.
//
// Erfindet KEINE neuen Testbefehle — nutzt ausschließlich package.json.
// Siehe docs/agent/TEST_POLICY.md.
//
// Nutzung: npm run agent:gates
//
// Zentrale Regel (Auftrag Abschnitt 5): ein wegen fehlender
// TEST_DATABASE_URL übersprungener DB-Integrationstest gilt NIE als PASS.
// Verlangt der Task db_test_required=true, muss TEST_DATABASE_URL gesetzt
// sein UND die betroffenen *-db.test.ts-Dateien müssen tatsächlich
// ausgeführte (nicht übersprungene) Tests melden — sonst DB_TESTS_NOT_EXECUTED.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { readTask, writeTask } from './lib/task-meta.mjs'
import { runVitestWithFailureSignatures, classifyFailures, decideTestGateStatus } from './lib/test-baseline.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const ACTIVE_DIR = join(REPO_ROOT, '.agent', 'active')

function findActiveTask() {
  if (!existsSync(ACTIVE_DIR)) return null
  const files = readdirSync(ACTIVE_DIR).filter((f) => f.endsWith('.md'))
  if (files.length === 0) return null
  if (files.length > 1) throw new Error(`Mehr als ein aktiver Task gefunden: ${files.join(', ')} — Pipeline erlaubt nur einen gleichzeitig.`)
  return readTask(join(ACTIVE_DIR, files[0]))
}

function run(label, command, args) {
  console.log(`\n--- ${label}: ${command} ${args.join(' ')} ---`)
  const result = spawnSync(command, args, { cwd: REPO_ROOT, encoding: 'utf8', shell: false })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  console.log(output.slice(-4000)) // letzte 4000 Zeichen reichen für die Zusammenfassung
  return { label, exitCode: result.status ?? 1, output }
}

// Vitest-Zusammenfassungszeile: "Test Files  X failed | Y passed | Z skipped (N)"
function parseVitestSummary(output) {
  const filesLine = output.match(/Test Files\s+([^\n]+)/)?.[1] ?? ''
  const testsLine = output.match(/(?<!Test Files\s{0,20})\bTests\s+([^\n]+)/)?.[1] ?? ''
  const parseCounts = (line) => ({
    failed: Number(line.match(/(\d+)\s+failed/)?.[1] ?? 0),
    passed: Number(line.match(/(\d+)\s+passed/)?.[1] ?? 0),
    skipped: Number(line.match(/(\d+)\s+skipped/)?.[1] ?? 0),
  })
  return { files: parseCounts(filesLine), tests: parseCounts(testsLine) }
}

// PIPELINE-001: Dateien, deren Tests tatsächlich an TEST_DATABASE_URL
// gekoppelt sind (RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL in der
// jeweiligen Datei — Namenskonvention *-db.test.ts + race-condition.test.ts,
// siehe docs/agent/TEST_POLICY.md). Andere Dateien mit eigenem, unrelated
// Skip-Gate (z. B. ein eigenes Env-Flag) gehören NICHT hierher.
function findDbTestFiles() {
  const dir = join(REPO_ROOT, 'tests', 'integration')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('-db.test.ts') || f === 'race-condition.test.ts')
    .map((f) => join('tests', 'integration', f))
}

const task = findActiveTask()
if (!task) {
  console.error('Kein aktiver Task in .agent/active/ — zuerst npm run agent:next ausführen.')
  process.exit(1)
}

if (task.meta.status === 'BLOCKED') {
  console.error(`Task ${task.meta.id} ist BLOCKED (Repair-Limit erreicht) — Gates werden nicht erneut ausgeführt.`)
  console.error('Root-Cause-Bericht in .agent/failed/ prüfen; Task manuell zurück in die Queue verschieben, um erneut zu starten.')
  process.exit(1)
}

const maxAttempts = task.meta.max_repair_attempts ?? 3
if ((task.meta.repair_attempts ?? 0) >= maxAttempts) {
  task.meta.status = 'BLOCKED'
  task.meta.blocked_reason = `Automatisches Repair-Limit (${maxAttempts}) erreicht — letzter Gate-Lauf weiterhin fehlgeschlagen.`
  writeTask(task)
  console.error(`BLOCKED: ${task.meta.blocked_reason}`)
  process.exit(1)
}

const results = {}
results.typecheck = run('TYPECHECK', 'npm', ['run', 'typecheck'])
results.lint = run('LINT', 'npm', ['run', 'lint'])

const testEnv = { ...process.env }
const dbUrlSet = !!process.env.TEST_DATABASE_URL

// PIPELINE-004: derselbe `vitest run` wie bisher (kein neuer Testbefehl),
// zusätzlich mit JSON-Reporter für strukturierte Failure-Signaturen —
// Standard-Reporter-Konsolenausgabe bleibt dadurch identisch zu vorher
// (parseVitestSummary funktioniert unverändert).
const gateJsonPath = join(tmpdir(), `agent-gate-${task.meta.id}-${Date.now()}.json`)
console.log(`\n--- TESTS: npx vitest run (mit Failure-Signaturen, siehe PIPELINE-004) ---`)
const testRun = runVitestWithFailureSignatures(REPO_ROOT, [], gateJsonPath)
console.log(testRun.output.slice(-4000))
results.test = { label: 'TESTS', exitCode: testRun.exitCode, output: testRun.output }
const vitestSummary = parseVitestSummary(results.test.output)

// Preexisting-Failure-Klassifizierung gegen die bei agent:next erfasste
// Baseline (task.meta.baseline_test_failures). `hasBaseline` ist nur dann
// true, wenn SOWOHL die Baseline als auch der aktuelle Lauf ein
// auswertbares JSON-Ergebnis hatten — ohne diese Evidenz bleibt es beim
// bisherigen, konservativen Verhalten (jeder Fehlschlag → FAIL). Tasks,
// die vor PIPELINE-004 aktiviert wurden, haben kein
// baseline_test_failures-Feld (undefined) → automatisch dasselbe
// konservative Verhalten wie bisher (Abwärtskompatibilität, analog
// PIPELINE-002).
const hasBaseline = Array.isArray(task.meta.baseline_test_failures) && testRun.parsedOk
const failureClassification = classifyFailures(task.meta.baseline_test_failures ?? [], testRun.signatures)
const testGateStatus = decideTestGateStatus({ testExitCode: results.test.exitCode, hasBaseline, classification: failureClassification })

// PIPELINE-001: die Klassifizierung darf sich NICHT mehr auf den globalen
// Skip-Zähler des Gesamtlaufs stützen (der zählt JEDEN Skip im Repo mit,
// unabhängig vom Grund — z. B. ein eigenes, unrelated Env-Gate einer
// E2E-Testdatei). Stattdessen ein gezielter, isolierter Probe-Lauf NUR der
// tatsächlich TEST_DATABASE_URL-gekoppelten Dateien — deren Skip-Zähler in
// dieser isolierten Ausführung ist eindeutig: > 0 bedeutet zwingend, dass
// TEST_DATABASE_URL für diese Dateien nicht griff.
let dbStatus = 'NOT_APPLICABLE'
let dbProbeSummary = null
if (task.meta.db_test_required) {
  if (!dbUrlSet) {
    dbStatus = 'DB_TESTS_NOT_EXECUTED'
  } else {
    const dbFiles = findDbTestFiles()
    if (dbFiles.length === 0) {
      dbStatus = 'DB_TESTS_EXECUTED' // keine DB-Testdateien im Projekt vorhanden — nichts zu blockieren
    } else {
      const dbProbe = run('DB-GATE-PROBE', 'npx', ['vitest', 'run', ...dbFiles])
      dbProbeSummary = parseVitestSummary(dbProbe.output)
      dbStatus = dbProbeSummary.tests.skipped > 0 ? 'DB_TESTS_PARTIALLY_SKIPPED' : 'DB_TESTS_EXECUTED'
    }
  }
}

results.build = run('BUILD', 'npm', ['run', 'build'])

if (task.meta.playwright_required) {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'))
  const hasPlaywright = !!(pkg.dependencies?.playwright || pkg.devDependencies?.playwright || pkg.devDependencies?.['@playwright/test'])
  results.playwright = hasPlaywright
    ? run('PLAYWRIGHT', 'npx', ['playwright', 'test'])
    : { label: 'PLAYWRIGHT', exitCode: null, output: 'PLAYWRIGHT_NOT_CONFIGURED — kein Playwright in package.json. Siehe docs/agent/TEST_POLICY.md.' }
}

const gateFailed =
  results.typecheck.exitCode !== 0 ||
  results.lint.exitCode !== 0 ||
  testGateStatus === 'FAIL' ||
  results.build.exitCode !== 0 ||
  (task.meta.db_test_required && dbStatus !== 'DB_TESTS_EXECUTED') ||
  (task.meta.playwright_required && results.playwright?.exitCode !== 0)

console.log('\n=== GATE SUMMARY ===')
console.log(`typecheck: ${results.typecheck.exitCode === 0 ? 'PASS' : 'FAIL'}`)
console.log(`lint: ${results.lint.exitCode === 0 ? 'PASS' : 'FAIL'}`)
console.log(`test:run: ${testGateStatus} (Files: ${JSON.stringify(vitestSummary.files)}, Tests: ${JSON.stringify(vitestSummary.tests)})`)
if (testGateStatus !== 'PASS') {
  console.log(`  → NEW_FAILURE: ${failureClassification.newFailures.length}, CHANGED_FAILURE: ${failureClassification.changedFailures.length}, PREEXISTING_FAILURE: ${failureClassification.preexistingFailures.length}, RESOLVED: ${failureClassification.resolvedFailures.length}`)
  if (!hasBaseline) console.log('  → Keine auswertbare Baseline-Evidenz — konservativ als FAIL gewertet (Sicherheitsprinzip, siehe PIPELINE-004).')
  for (const f of failureClassification.newFailures) console.log(`  → NEW_FAILURE: ${f.key}`)
  for (const f of failureClassification.changedFailures) console.log(`  → CHANGED_FAILURE: ${f.key}`)
  for (const f of failureClassification.preexistingFailures) console.log(`  → PREEXISTING_FAILURE (Review erlaubt): ${f.key}`)
}
console.log(`db_test_required=${task.meta.db_test_required} → ${dbStatus}${dbProbeSummary ? ` (DB-Gate-Probe: ${JSON.stringify(dbProbeSummary.tests)})` : ''}`)
console.log(`build: ${results.build.exitCode === 0 ? 'PASS' : 'FAIL'}`)
if (task.meta.playwright_required) console.log(`playwright: ${results.playwright.exitCode === 0 ? 'PASS' : results.playwright.exitCode === null ? 'NOT_CONFIGURED' : 'FAIL'}`)
console.log(`\nGESAMT: ${gateFailed ? 'FAIL' : 'PASS'}`)

task.meta.last_gate_run = {
  at: new Date().toISOString(),
  typecheck: results.typecheck.exitCode === 0 ? 'PASS' : 'FAIL',
  lint: results.lint.exitCode === 0 ? 'PASS' : 'FAIL',
  test_run: testGateStatus, // 'PASS' | 'PASS_WITH_PREEXISTING_FAILURES' | 'FAIL'
  test_summary: vitestSummary,
  preexisting_failures_present: failureClassification.preexistingFailures.length > 0,
  new_failures: failureClassification.newFailures,
  changed_failures: failureClassification.changedFailures,
  preexisting_failures: failureClassification.preexistingFailures,
  resolved_failures_count: failureClassification.resolvedFailures.length,
  baseline_test_failures_available: hasBaseline,
  db_test_status: dbStatus,
  db_gate_probe: dbProbeSummary,
  build: results.build.exitCode === 0 ? 'PASS' : 'FAIL',
  playwright: task.meta.playwright_required ? (results.playwright.exitCode === 0 ? 'PASS' : results.playwright.exitCode === null ? 'NOT_CONFIGURED' : 'FAIL') : 'NOT_APPLICABLE',
  result: gateFailed ? 'FAIL' : 'PASS',
}

if (gateFailed) {
  task.meta.repair_attempts = (task.meta.repair_attempts ?? 0) + 1
  task.meta.status = task.meta.repair_attempts >= maxAttempts ? 'BLOCKED' : 'TEST_FAILED'
  if (task.meta.status === 'BLOCKED') {
    task.meta.blocked_reason = `Repair-Limit (${maxAttempts}) erreicht — siehe last_gate_run für die letzte Fehlerursache.`
  }
} else {
  task.meta.status = 'IMPLEMENTED'
}

writeTask(task)
console.log(`\nTask-Status: ${task.meta.status} (Repair-Versuche: ${task.meta.repair_attempts ?? 0}/${maxAttempts})`)
process.exit(gateFailed ? 1 : 0)
