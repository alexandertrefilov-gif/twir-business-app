// scripts/agent/lib/git-fingerprint.mjs
// PIPELINE-002: Inhaltsbasierter Fingerprint je Dateipfad für next-task.mjs/
// finish-task.mjs — unterscheidet zuverlässig zwischen "Datei war bereits
// vor Task-Aktivierung dirty, aber während des Tasks NICHT weiter
// verändert" und "Datei wurde während des Tasks zusätzlich verändert",
// auch wenn beide Zustände in `git status --short` identisch aussehen
// (beide "M"). HEAD bewegt sich während eines Pipeline-Laufs nie (kein
// Commit ohne separate Freigabe) — jede echte Änderung während des Tasks
// zeigt sich daher als Änderung des Diffs gegen HEAD (getrackte Dateien)
// bzw. des Dateiinhalts selbst (neue/untracked Dateien, für die es keinen
// HEAD-Diff gibt).

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function sha256(input) {
  return createHash('sha256').update(input).digest('hex')
}

function isTracked(repoRoot, path) {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', path], { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0
}

function isTrackedAtHead(repoRoot, path) {
  const result = spawnSync('git', ['cat-file', '-e', `HEAD:${path}`], { cwd: repoRoot, encoding: 'utf8' })
  return result.status === 0
}

// 'ABSENT' = Datei existiert nicht (gelöscht/nie vorhanden). Sonst ein
// SHA-256-Hash entweder des Diffs gegen HEAD (getrackte Datei — bewusst
// NICHT der volle Dateiinhalt, damit eine bereits vor Aktivierung
// bestehende Änderung Teil der Baseline bleibt und nur eine ZUSÄTZLICHE
// Änderung den Hash verschiebt) oder des rohen Dateiinhalts (untracked
// Datei, für die `git diff HEAD` nichts liefert).
export function fingerprintPath(repoRoot, path) {
  const abs = join(repoRoot, path)
  if (!existsSync(abs)) return 'ABSENT'
  // Verteidigung: gitDirtyPaths() liefert dank --untracked-files=all keine
  // Verzeichnis-Zeilen mehr, aber falls doch je ein Verzeichnispfad hier
  // ankommt (z. B. über einen anderen Aufrufer), nicht mit EISDIR abstürzen.
  if (statSync(abs).isDirectory()) return 'DIRECTORY'
  if (isTracked(repoRoot, path)) {
    const diff = spawnSync('git', ['diff', 'HEAD', '--', path], { cwd: repoRoot, encoding: 'utf8' })
    return sha256(diff.stdout ?? '')
  }
  return sha256(readFileSync(abs))
}

// `--no-renames`: eine Umbenennung erscheint dadurch als zwei separate
// Einträge (Löschung der alten Datei + Hinzufügung der neuen) statt einer
// mehrdeutigen "alt -> neu"-Zeile. `-z`: NUL-getrennte, UNQUOTIERTE Ausgabe
// — ohne dieses Flag setzt Git Pfade mit Leerzeichen/Sonderzeichen in
// literale Anführungszeichen (`"my dir/file.txt"`), was beim naiven
// Parsen den Pfad selbst verfälscht. `--untracked-files=all`: ein
// vollständig untracked-es Verzeichnis erscheint sonst als EINE
// Verzeichnis-Zeile (z. B. `?? scripts/`) statt seiner einzelnen Dateien —
// fingerprintPath() kann aber nur Dateien hashen, kein Verzeichnis (führte
// sonst zu `EISDIR`, siehe REQ-018-Aktivierung). Mit diesem Flag listet
// Git stattdessen jede Datei einzeln.
export function gitDirtyPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--short', '--no-renames', '--untracked-files=all', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  return (result.stdout ?? '').split('\0').filter(Boolean).map((entry) => entry.slice(3))
}

export function fingerprintAll(repoRoot, paths) {
  const out = {}
  for (const path of paths) out[path] = fingerprintPath(repoRoot, path)
  return out
}

// Ergänzt eine gespeicherte Baseline-Fingerprint-Map (nur für die zum
// Aktivierungszeitpunkt DIRTY-en Pfade befüllt, siehe next-task.mjs) um
// IMPLIZITE Einträge für Pfade, die dort fehlen, aber am Ende relevant
// sind: war der Pfad zu Aktivierungszeitpunkt bereits im letzten Commit
// vorhanden, MUSS er dort sauber gewesen sein (sonst wäre er über
// gitDirtyPaths() explizit erfasst worden) — impliziter Fingerprint ist
// der einer sauberen, unveränderten Datei (Hash des leeren Diffs). War er
// dort nicht vorhanden, hat er zu Aktivierungszeitpunkt schlicht nicht
// existiert — impliziter Fingerprint 'ABSENT'.
//
// Ohne diese Ergänzung sähe eine zwischen Aktivierung und Abschluss
// GELÖSCHTE, vorher saubere Datei fälschlich wie "keine Änderung" aus:
// ihr aktueller Fingerprint ('ABSENT', Datei existiert nicht mehr) und ein
// naiver fehlender-Baseline-Eintrag (ebenfalls als 'ABSENT' interpretiert)
// wären identisch, obwohl sich der tatsächliche Zustand geändert hat.
export function resolveBaseline(repoRoot, storedBaseline, paths) {
  const resolved = { ...storedBaseline }
  for (const path of paths) {
    if (path in resolved) continue
    resolved[path] = isTrackedAtHead(repoRoot, path) ? sha256('') : 'ABSENT'
  }
  return resolved
}

// Liefert genau die Pfade, deren Fingerprint sich zwischen zwei Ständen
// geändert hat — unabhängig davon, ob der Pfad in beiden, nur einem oder
// keinem der beiden Stände als "dirty" geführt wurde.
export function diffFingerprints(baseline, current) {
  const paths = new Set([...Object.keys(baseline), ...Object.keys(current)])
  const changed = []
  for (const path of paths) {
    const before = baseline[path] ?? 'ABSENT'
    const after = current[path] ?? 'ABSENT'
    if (before !== after) changed.push(path)
  }
  return changed
}
