// scripts/agent/lib/test-baseline.mjs
// PIPELINE-004: strukturierte Failure-Signaturen aus Vitest-Läufen erfassen
// und einen aktuellen Testlauf gegen eine zuvor erfasste Baseline
// klassifizieren (PASS / NEW_FAILURE / PREEXISTING_FAILURE /
// CHANGED_FAILURE). Nutzt ausschließlich das bereits vorhandene
// `vitest run` (über den JSON-Reporter, zusätzlich zum Standard-Reporter —
// die normale Konsolenausgabe bleibt dadurch unverändert), erfindet keinen
// neuen Testbefehl. Siehe docs/agent/TEST_POLICY.md Abschnitt
// "Preexisting Failures".
//
// Sicherheitsprinzip (siehe .agent/completed/PIPELINE-004.md): ein Fehler
// gilt NUR dann als PREEXISTING_FAILURE, wenn für EXAKT dieselbe Test-
// Identität (Datei + voller Testname) bereits in der bei Task-Aktivierung
// erfassten Baseline ein Fehlschlag mit derselben normalisierten
// Fehlermeldung vorlag. Ohne Baseline-Evidenz wird IMMER konservativ FAIL
// gemeldet — kein automatisches Verstecken unbelegter "Known Issues".

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { relative, sep } from 'node:path'

// Entfernt offensichtlich dynamische Inhalte (ANSI-Codes, UUIDs, Zeit-
// stempel, lange Zahlen) aus einer Fehlermeldung, damit derselbe
// fachliche Fehler nicht allein wegen einer neuen ID/eines neuen
// Zeitstempels als CHANGED_FAILURE erscheint. Bewusst KEIN Volltext-
// Snapshot des gesamten Outputs — nur eine begrenzte, normalisierte
// Signatur (max. 400 Zeichen).
export function normalizeFailureMessage(raw) {
  if (!raw) return ''
  return raw
    .replace(/\[[0-9;]*m/g, '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<timestamp>')
    .replace(/\b\d{5,}\b/g, '<num>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}

// Extrahiert je fehlgeschlagener Assertion eine strukturierte Signatur aus
// dem Vitest-JSON-Reporter-Ergebnis (Jest-kompatibles Format).
export function extractFailureSignatures(jsonResult, repoRoot) {
  const out = []
  for (const testResult of jsonResult?.testResults ?? []) {
    const file = relative(repoRoot, testResult.name).split(sep).join('/')
    for (const assertion of testResult.assertionResults ?? []) {
      if (assertion.status !== 'failed') continue
      const testName = assertion.fullName || [...(assertion.ancestorTitles ?? []), assertion.title].filter(Boolean).join(' ')
      const message = normalizeFailureMessage((assertion.failureMessages ?? []).join('\n'))
      out.push({ file, testName, message, key: `${file}::${testName}` })
    }
  }
  return out
}

// Führt `vitest run` mit zusätzlichem JSON-Reporter aus (Standard-Reporter
// bleibt aktiv — identische Konsolenausgabe wie bisher) und liefert sowohl
// die rohe Konsolenausgabe als auch die extrahierten Failure-Signaturen.
// `parsedOk: false` bedeutet: JSON-Ergebnis fehlt/ist ungültig — Aufrufer
// MUSS das konservativ behandeln (siehe decideTestGateStatus).
export function runVitestWithFailureSignatures(repoRoot, extraArgs, jsonOutPath) {
  const args = ['vitest', 'run', ...extraArgs, '--reporter=default', '--reporter=json', `--outputFile.json=${jsonOutPath}`]
  const result = spawnSync('npx', args, { cwd: repoRoot, encoding: 'utf8', shell: false })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  let signatures = []
  let parsedOk = false
  let counts = null
  if (existsSync(jsonOutPath)) {
    try {
      const json = JSON.parse(readFileSync(jsonOutPath, 'utf8'))
      signatures = extractFailureSignatures(json, repoRoot)
      counts = { failed: json.numFailedTests ?? 0, passed: json.numPassedTests ?? 0, pending: json.numPendingTests ?? 0 }
      parsedOk = true
    } catch {
      // JSON fehlt oder ist kaputt (z. B. Lauf abgebrochen) — parsedOk
      // bleibt false, Aufrufer behandelt das konservativ als "keine
      // auswertbare Baseline/kein auswertbares Ergebnis".
    } finally {
      try { unlinkSync(jsonOutPath) } catch { /* bestmögliches Aufräumen, kein harter Fehler */ }
    }
  }
  return { exitCode: result.status ?? 1, output, signatures, parsedOk, counts }
}

// Vergleicht Baseline- gegen aktuelle Failure-Signaturen anhand der Test-
// Identität (Datei+Testname). Gleiche Identität + gleiche normalisierte
// Meldung → PREEXISTING_FAILURE. Gleiche Identität, andere Meldung →
// CHANGED_FAILURE (gilt NICHT als preexisting — ein veränderter Fehler
// könnte ein neues, verwandtes Problem sein). Keine passende Baseline-
// Identität → NEW_FAILURE. Baseline-Fehler ohne aktuelles Gegenstück →
// resolvedFailures (informativ, blockiert nichts).
export function classifyFailures(baselineFailures, currentFailures) {
  const baselineByKey = new Map((baselineFailures ?? []).map((f) => [f.key, f]))
  const newFailures = []
  const preexistingFailures = []
  const changedFailures = []
  for (const current of currentFailures) {
    const base = baselineByKey.get(current.key)
    if (!base) {
      newFailures.push(current)
    } else if (base.message === current.message) {
      preexistingFailures.push(current)
    } else {
      changedFailures.push(current)
    }
  }
  const currentKeys = new Set(currentFailures.map((f) => f.key))
  const resolvedFailures = (baselineFailures ?? []).filter((f) => !currentKeys.has(f.key))
  return { newFailures, preexistingFailures, changedFailures, resolvedFailures }
}

// Zentrale Gate-Entscheidung für den test:run-Schritt.
// `hasBaseline` muss NUR dann true sein, wenn sowohl bei Aktivierung als
// auch beim aktuellen Lauf ein auswertbares JSON-Ergebnis vorlag — sonst
// gibt es keine belastbare Evidenz für "preexisting" und es bleibt
// konservativ bei FAIL (Sicherheitsprinzip).
export function decideTestGateStatus({ testExitCode, hasBaseline, classification }) {
  if (testExitCode === 0) return 'PASS'
  if (!hasBaseline) return 'FAIL'
  const { newFailures, changedFailures, preexistingFailures } = classification
  if (newFailures.length === 0 && changedFailures.length === 0 && preexistingFailures.length > 0) {
    return 'PASS_WITH_PREEXISTING_FAILURES'
  }
  return 'FAIL'
}
