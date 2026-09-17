import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { LocalFilesystemArchiveStorage } from '@/lib/documents/archive-storage'
import {
  archiveBreadcrumbs,
  normalizeArchiveRelativePath,
} from '@/lib/documents/archive-explorer.service'
import { offerDisplayName, offerNumberForDisplay } from '@/lib/offers/offer-display'
import { buildArchiveDirectory, buildArchiveFilename, buildBusinessCaseArchiveDirectory, buildCustomerArchiveDirectory, existingBusinessCaseArchiveDirectory, sanitizeArchiveSegment } from '@/lib/documents/archive-naming'
import { renderBusinessDocumentDocx } from '@/lib/documents/document-docx'

const temporaryDirectories: string[] = []
async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'twir-archive-test-'))
  temporaryDirectories.push(directory)
  return directory
}
afterEach(async () => { await Promise.all(temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true }))) })

describe('external document archive', () => {
  it('builds deterministic human-readable paths and sanitizes customer input', () => {
    expect(buildArchiveDirectory({ year: 2026, customerNumber: 'KD-0003', customerName: 'Müller/../AG', projectName: 'Prüfung: Halle 1', category: '01_Angebote', number: 'AN 260901' }))
      .toBe(path.join('2026', 'KD-0003_Muller-AG', 'Prufung-Halle-1', '01_Angebote', 'AN-260901'))
    expect(buildArchiveFilename('RE2026-0001', 'FINAL', 'pdf')).toBe('RE2026-0001_FINAL.pdf')
    expect(sanitizeArchiveSegment('../../etc/passwd')).not.toContain('..')
    expect(buildCustomerArchiveDirectory({ year: 2026, customerNumber: 'KD-0003', customerName: 'Müller AG' }))
      .toBe(path.join('2026', 'KD-0003_Muller-AG'))
  })

  it('groups every document type below one stable business-case directory', () => {
    const common = {
      year: 2026,
      customerNumber: 'KD-0004',
      customerName: 'Mike Werner',
      areaName: 'GGA Lagerplanung',
      businessCaseId: 'offer-6c0dbe28-3924-4da1-a958-15ca15d5ae6b',
    }
    const categories = ['01_Angebot', '02_Bestellung', '03_Auftrag', '04_Leistung', '05_Rechnung'] as const
    const paths = categories.map(category => buildBusinessCaseArchiveDirectory({ ...common, category }))
    const caseDirectory = path.join('2026', 'KD-0004_Mike-Werner', 'GGA-Lagerplanung', 'Vorgang_offer-6c0dbe28-3924-4da1-a958-15ca15d5ae6b')
    expect(paths).toEqual(categories.map(category => path.join(caseDirectory, category)))
    expect(existingBusinessCaseArchiveDirectory([
      path.join(paths[0], 'AN-260901_ENTWURF.pdf'),
    ])).toBe(caseDirectory)
  })

  it('atomically replaces drafts but never overwrites final files', async () => {
    const root = await temporaryDirectory()
    const storage = new LocalFilesystemArchiveStorage(root)
    await storage.writeFile('2026/test_ENTWURF.pdf', Buffer.from('first'), 'replace')
    await storage.writeFile('2026/test_ENTWURF.pdf', Buffer.from('second'), 'replace')
    expect(await fs.readFile(path.join(root, '2026/test_ENTWURF.pdf'), 'utf8')).toBe('second')
    await storage.writeFile('2026/test_FINAL.pdf', Buffer.from('final'), 'exclusive')
    await expect(storage.writeFile('2026/test_FINAL.pdf', Buffer.from('changed'), 'exclusive')).rejects.toThrow(/existiert bereits/)
    expect(await fs.readFile(path.join(root, '2026/test_FINAL.pdf'), 'utf8')).toBe('final')
  })

  it('rejects path traversal and supports a write health check', async () => {
    const root = await temporaryDirectory()
    const storage = new LocalFilesystemArchiveStorage(root)
    await expect(storage.writeFile('../outside.pdf', Buffer.from('x'), 'replace')).rejects.toThrow(/Basisverzeichnis/)
    await expect(storage.healthCheck(true)).resolves.toEqual({ ok: true, message: 'Archivpfad ist erreichbar und beschreibbar.' })
  })

  it('lists the real directory hierarchy and reads supported files', async () => {
    const root = await temporaryDirectory()
    const storage = new LocalFilesystemArchiveStorage(root)
    await storage.writeFile('2026/KD-0003/Projekt/01_Angebote/AN-260901/AN-260901_FINAL.pdf', Buffer.from('%PDF-test'), 'exclusive')
    await storage.writeFile('2026/KD-0003/Projekt/01_Angebote/AN-260901/AN-260901_FINAL.docx', Buffer.from('PK-test'), 'exclusive')
    await storage.writeFile('2026/KD-0003/Projekt/01_Angebote/AN-260901/AN-260901.meta.json', Buffer.from('{"number":"AN-260901"}'), 'exclusive')
    await fs.writeFile(path.join(root, '2026', 'KD-0003', 'ignored.txt'), 'ignored')

    const rootEntries = await storage.listDirectory('')
    expect(rootEntries).toMatchObject([{ name: '2026', kind: 'directory' }])
    const documentEntries = await storage.listDirectory('2026/KD-0003/Projekt/01_Angebote/AN-260901')
    expect(documentEntries.map(entry => entry.fileType).sort()).toEqual(['docx', 'json', 'pdf'])
    expect(await storage.readFile(documentEntries.find(entry => entry.fileType === 'pdf')!.relativePath)).toEqual(Buffer.from('%PDF-test'))
  })

  it('searches filenames and their customer/project path and calculates physical statistics', async () => {
    const root = await temporaryDirectory()
    const storage = new LocalFilesystemArchiveStorage(root)
    await storage.writeFile('2026/KD-0003_Mercedes/Umzug-Werkstoffprufung/AN-260901/AN-260901.pdf', Buffer.alloc(20), 'exclusive')
    await storage.writeFile('2026/KD-0003_Mercedes/Umzug-Werkstoffprufung/AN-260901/AN-260901.docx', Buffer.alloc(30), 'exclusive')

    await expect(storage.search('Mercedes')).resolves.toHaveLength(2)
    await expect(storage.search('Werkstoff')).resolves.toHaveLength(2)
    await expect(storage.search('260901')).resolves.toHaveLength(2)
    await expect(storage.getStatistics()).resolves.toEqual({ fileCount: 2, totalSize: 50 })
  })

  it('blocks absolute paths, traversal and symlink escapes for read operations', async () => {
    const root = await temporaryDirectory()
    const outside = await temporaryDirectory()
    const storage = new LocalFilesystemArchiveStorage(root)
    await fs.writeFile(path.join(outside, 'secret.pdf'), 'secret')
    await fs.symlink(outside, path.join(root, 'external'))

    await expect(storage.listDirectory('../')).rejects.toThrow(/Basisverzeichnis/)
    await expect(storage.readFile('/etc/passwd')).rejects.toThrow(/Absolute/)
    await expect(storage.readFile('external/secret.pdf')).rejects.toThrow(/Symbolischer Link/)
  })

  it('builds clickable breadcrumbs from validated relative paths', () => {
    expect(normalizeArchiveRelativePath('2026/KD-0003/Projekt')).toBe(path.join('2026', 'KD-0003', 'Projekt'))
    expect(() => normalizeArchiveRelativePath('../secret')).toThrow(/Ungültiger/)
    expect(archiveBreadcrumbs('2026/KD-0003/01_Angebote')).toEqual([
      { label: 'Dokumentenarchiv', path: '' },
      { label: '2026', path: '2026' },
      { label: 'KD-0003', path: path.join('2026', 'KD-0003') },
      { label: '01 Angebote', path: path.join('2026', 'KD-0003', '01_Angebote') },
    ])
  })

  it('uses the current offer project designation only as the visible offer-folder label', () => {
    const directory = path.join('2026', 'KD-0003', 'Bestandsprojekt', '01_Angebote', 'AN-260905')
    const labels = new Map([
      [directory, offerDisplayName('AN-260905', '  Umbau Gefahrstoffschrank Geb. 7  ')],
    ])

    expect(offerDisplayName('AN-260905', 'Umbau Gefahrstoffschrank Geb. 7'))
      .toBe('AN-260905 – Umbau Gefahrstoffschrank Geb. 7')
    expect(offerDisplayName('AN-260905', null)).toBe('AN-260905')
    expect(offerDisplayName('AN-260905', '   ')).toBe('AN-260905')
    expect(offerNumberForDisplay('AN 260901')).toBe('AN-260901')
    expect(offerNumberForDisplay('AN-260901')).toBe('AN-260901')
    expect(archiveBreadcrumbs(directory, labels).at(-1)).toEqual({
      label: 'AN-260905 – Umbau Gefahrstoffschrank Geb. 7',
      path: directory,
    })
    expect(directory.endsWith(path.join('01_Angebote', 'AN-260905'))).toBe(true)
  })

  it('never exposes a technical business-case directory without a resolved label', () => {
    const directory = path.join('2026', 'KD-0004_Mike-Werner', 'GGA-Lagerplanung', 'Vorgang_offer-secret-id')
    expect(archiveBreadcrumbs(directory).at(-1)?.label).toBe('Geschäftsvorgang')
    expect(archiveBreadcrumbs(directory).map(item => item.label).join(' ')).not.toContain('Vorgang_offer-')
  })

  it('creates a real editable DOCX containing document data and positions', async () => {
    const output = await renderBusinessDocumentDocx({ company: { companyName: 'TWIR GmbH' }, customer: { name: 'Mercedes-Benz AG' }, offerNumber: 'AN 260901', offerDate: '01.09.2026', title: 'Werkstoffprüfung', items: [{ position: 1, description: 'Fachbauleitung', quantity: 2, unit: 'Std.', unitPrice: 100, netAmount: 200 }], totalNet: 200, totalTax: 38, totalGross: 238 }, 'Angebot')
    expect(output.subarray(0, 2).toString()).toBe('PK')
    expect(output.length).toBeGreaterThan(1000)
  })

  it.each(['Angebot', 'Auftrag', 'Leistungsnachweis', 'Rechnung'])('creates DOCX emergency copies for %s', async (label) => {
    const output = await renderBusinessDocumentDocx({ company: { companyName: 'TWIR GmbH' }, customer: { name: 'Kunde GmbH' }, title: 'Projekt', items: [] }, label)
    expect(output.subarray(0, 2).toString()).toBe('PK')
  })
})
