import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const page = readFileSync(resolve(process.cwd(), 'app/(dashboard)/documents/page.tsx'), 'utf8')
const explorer = readFileSync(resolve(process.cwd(), 'components/documents/DocumentExplorer.tsx'), 'utf8')
const route = readFileSync(resolve(process.cwd(), 'app/api/document-archive/file/route.ts'), 'utf8')
const archiveService = readFileSync(resolve(process.cwd(), 'lib/documents/archive-explorer.service.ts'), 'utf8')

describe('Dokumentenarchiv-Explorer', () => {
  it('uses the physical archive explorer instead of the former flat database list', () => {
    expect(page).toContain('getArchiveExplorer')
    expect(page).toContain('<DocumentExplorer')
    expect(page).not.toContain('getDocuments(')
    expect(page).toContain('Dokumentvorgänge')
    expect(page).toContain('Physische Dateien')
    expect(page).toContain('Archivgröße')
  })

  it('provides breadcrumbs, global search, sorting and refresh', () => {
    expect(explorer).toContain('props.breadcrumbs.map')
    expect(page).toContain('breadcrumbs={result.breadcrumbs}')
    expect(explorer).toContain('{entry.displayName}')
    expect(explorer).toContain('{entry.displayParentPath}')
    expect(page).toContain('Kunde oder Projekt suchen')
    expect(explorer).toContain('field="name"')
    expect(explorer).toContain('field="type"')
    expect(explorer).toContain('field="modified"')
    expect(explorer).toContain('field="size"')
    expect(explorer).toContain('router.refresh()')
  })

  it('offers suitable PDF and DOCX actions while technical JSON sidecars stay hidden', () => {
    expect(explorer).toContain('PDF-Vorschau')
    expect(page).toContain('getArchiveExplorer')
    expect(archiveService).toContain('.filter(isUserVisibleArchiveEntry)')
    expect(explorer).toContain('Download')
    expect(explorer).toContain('sm:table-cell')
    expect(explorer).toContain('md:table-cell')
  })

  it('protects every archive file request with document read permission', () => {
    expect(route).toContain('requirePermission(Resource.DOCUMENT, Action.READ)')
    expect(route).toContain('normalizeArchiveRelativePath')
    expect(route).toContain("'Cache-Control': 'private, no-store'")
    expect(route).toContain("'X-Content-Type-Options': 'nosniff'")
  })
})
