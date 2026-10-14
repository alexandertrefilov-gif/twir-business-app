import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(__dirname, '../../../lib/billing')
const files = readdirSync(dir).filter((name) => name.endsWith('.ts'))

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// Verbotene Konstrukte für Geldberechnungen in lib/billing/**
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bNumber\s*\(/, 'Number(...)'],
  [/\bparseFloat\s*\(/, 'parseFloat'],
  [/\bparseInt\s*\(/, 'parseInt'],
  [/\bMath\./, 'Math.*'],
  [/\.toNumber\s*\(/, '.toNumber()'],
  [/\bas\s+number\b/, 'as number'],
]

describe('lib/billing enthält keine Float-Arithmetik', () => {
  it('Verzeichnis enthält die erwarteten Dateien', () => {
    expect(files).toEqual(expect.arrayContaining(['invoice-calculator.ts', 'money.ts', 'index.ts']))
  })

  for (const file of files) {
    it(`${file}: keine verbotenen Konstrukte`, () => {
      const code = stripComments(readFileSync(path.join(dir, file), 'utf8'))
      const withoutStrings = code.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""')
      for (const [pattern, label] of FORBIDDEN) {
        expect(pattern.test(withoutStrings), `${file}: ${label} gefunden`).toBe(false)
      }
    })
  }

  it('Geld-Rundung nur über ROUND_HALF_UP', () => {
    const money = readFileSync(path.join(dir, 'money.ts'), 'utf8')
    expect(money).toContain('ROUND_HALF_UP')
    expect(stripComments(money)).not.toMatch(/ROUND_(HALF_EVEN|HALF_DOWN|DOWN|UP|CEIL|FLOOR)\b/)
  })
})
