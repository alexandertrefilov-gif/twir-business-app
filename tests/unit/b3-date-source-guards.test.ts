// REQ-029 P5-6 B-3: Quellcode-Wächter – keine zeitzonenabhängigen Datumskonstruktionen in produktivem Anzeige-/PDF-/Archiv-/Formular-Code.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(__dirname, '../..')
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(rel, out)
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel)
  }
  return out
}
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const UI_AND_PDF = [...walk('app'), ...walk('components'), ...walk('lib/pdf-templates'), ...walk('lib/documents'),
  ...['invoice-pdf', 'offer-pdf', 'order-pdf', 'service-report-pdf', 'gga-cabinet-schrankakte'].map((n) => `lib/services/${n}.service.ts`)]

describe('B-3 Quellcode-Wächter', () => {
  it('kein date-fns in Anzeige-, PDF- und Archivcode (nutzt Prozess-/Browser-Zeitzone)', () => {
    const offenders = UI_AND_PDF.filter((f) => /from ['"]date-fns/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('kein toLocaleDateString (Browser-/Prozess-Zeitzone) in Anzeigecode', () => {
    expect(UI_AND_PDF.filter((f) => /\.toLocaleDateString\(/.test(read(f)))).toEqual([])
  })

  it('kein Intl.DateTimeFormat ohne explizite timeZone in Anzeigecode', () => {
    const offenders = UI_AND_PDF.filter((f) => {
      const src = read(f)
      return [...src.matchAll(/Intl\.DateTimeFormat\([^)]*\)/g)].some((m) => !/timeZone/.test(m[0]))
    })
    expect(offenders).toEqual([])
  })

  it('keine Zeitpunkte per toLocaleString/toLocaleTimeString in Anzeigecode (Prozess-/Browser-Zeitzone)', () => {
    const offenders = UI_AND_PDF.filter((f) => /(At|Date|\bat|modifiedAt)\)?\.toLocale(Time)?String\(/.test(read(f)) || /\.toLocaleTimeString\(/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('„heute“ wird nie aus new Date().toISOString().slice(0, 10) gebildet', () => {
    const offenders = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) =>
      /new Date\(\)\.toISOString\(\)\.slice\(0, ?10\)/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('keine lokale Kalenderarithmetik (setDate/getDate) in Formularen', () => {
    const offenders = walk('components').filter((f) => /\.setDate\(|\.getDate\(\)/.test(read(f)))
    expect(offenders).toEqual([])
  })

  it('Archivjahre werden nicht über lokale getFullYear() abgeleitet', () => {
    const files = [...walk('lib/documents'), 'lib/services/external-confirmation.service.ts', 'lib/services/customer-purchase-order.service.ts']
    expect(files.filter((f) => /\.getFullYear\(\)/.test(read(f)))).toEqual([])
  })

  it('Kalendertag- und Instant-Formatter sind verschiedene Exporte', async () => {
    const mod = await import('@/lib/utils/berlin-date')
    expect(mod.formatCalendarDate).not.toBe(mod.formatBerlinDate)
    expect(mod.calendarYear).not.toBe(mod.berlinYear)
    const src = read('lib/utils/berlin-date.ts')
    const calendarSection = src.slice(src.indexOf('export function formatCalendarDate('), src.indexOf('export function berlinTodayIso'))
    expect(calendarSection).not.toMatch(/Europe\/Berlin|BERLIN_TIME_ZONE/)
  })

  it('Bestandsaufnahme-Datum aus dem Wizard ist ein Berliner Kalendertag, kein UTC-Zeitstempel', () => {
    const src = read('components/collaboration/GgaCabinetIntakeWizard.tsx')
    expect(src).toMatch(/bestandsaufnahmeAm: berlinTodayIso\(\)/)
  })
})
