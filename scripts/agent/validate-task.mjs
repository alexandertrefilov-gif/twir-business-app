#!/usr/bin/env node
// scripts/agent/validate-task.mjs
// Validiert eine Task-Datei (AGENT-META-Block) gegen das Pflichtschema.
// Nutzung: node scripts/agent/validate-task.mjs <pfad-zur-task-datei>
// Ohne Pfad: validiert alle Dateien unter .agent/queue/.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readTask, validateTask } from './lib/task-meta.mjs'

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const QUEUE_DIR = join(REPO_ROOT, '.agent', 'queue')

function validateFile(filePath) {
  try {
    const { meta } = readTask(filePath)
    const errors = validateTask(meta)
    if (errors.length === 0) {
      console.log(`OK    ${filePath}`)
      return true
    }
    console.log(`FEHLER ${filePath}`)
    for (const error of errors) console.log(`  - ${error}`)
    return false
  } catch (error) {
    console.log(`FEHLER ${filePath}`)
    console.log(`  - ${error.message}`)
    return false
  }
}

const argPath = process.argv[2]
let allOk = true

if (argPath) {
  allOk = validateFile(argPath)
} else {
  const files = readdirSync(QUEUE_DIR).filter((f) => f.endsWith('.md'))
  if (files.length === 0) {
    console.log(`Keine Task-Dateien in ${QUEUE_DIR}`)
  }
  for (const file of files) {
    const ok = validateFile(join(QUEUE_DIR, file))
    allOk = allOk && ok
  }
}

process.exit(allOk ? 0 : 1)
