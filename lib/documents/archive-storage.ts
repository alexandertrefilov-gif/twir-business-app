import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export type ArchiveWriteMode = 'replace' | 'exclusive'

export type ArchiveEntryKind = 'directory' | 'file'
export type ArchiveFileType = 'pdf' | 'docx' | 'xlsx' | 'image' | 'json' | 'other'

export interface ArchiveEntry {
  name: string
  relativePath: string
  kind: ArchiveEntryKind
  fileType: ArchiveFileType
  size: number | null
  modifiedAt: Date
  itemCount: number | null
}

export interface ArchiveSearchOptions {
  maxResults?: number
  maxEntries?: number
}

export interface ArchiveStatistics {
  fileCount: number
  totalSize: number
}

export interface DocumentArchiveStorage {
  ensureDirectory(relativeDirectory: string): Promise<void>
  writeFile(relativePath: string, contents: Uint8Array, mode: ArchiveWriteMode): Promise<void>
  exists(relativePath: string): Promise<boolean>
  listDirectory(relativeDirectory: string): Promise<ArchiveEntry[]>
  stat(relativePath: string): Promise<ArchiveEntry>
  readFile(relativePath: string): Promise<Buffer>
  deleteFile(relativePath: string): Promise<void>
  search(query: string, options?: ArchiveSearchOptions): Promise<ArchiveEntry[]>
  getStatistics(): Promise<ArchiveStatistics>
  healthCheck(createTestFile?: boolean): Promise<{ ok: boolean; message: string }>
}

export class LocalFilesystemArchiveStorage implements DocumentArchiveStorage {
  private readonly root: string

  constructor(basePath: string) {
    if (!basePath.trim()) throw new Error('Archiv-Basispfad fehlt.')
    this.root = path.resolve(basePath)
  }

  private resolve(relativePath: string): string {
    if (relativePath.includes('\0')) throw new Error('Ungültiger Archivpfad.')
    if (path.isAbsolute(relativePath)) throw new Error('Absolute Archiv-Unterpfade sind nicht erlaubt.')
    const resolved = path.resolve(this.root, relativePath)
    if (resolved !== this.root && !resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error('Archivpfad verlässt das konfigurierte Basisverzeichnis.')
    }
    return resolved
  }

  private async resolveExisting(relativePath: string): Promise<string> {
    const resolved = this.resolve(relativePath)
    const [rootReal, targetReal] = await Promise.all([
      fs.realpath(this.root),
      fs.realpath(resolved),
    ])
    if (targetReal !== rootReal && !targetReal.startsWith(`${rootReal}${path.sep}`)) {
      throw new Error('Symbolischer Link verlässt das Archivverzeichnis.')
    }
    const linkInfo = await fs.lstat(resolved)
    if (linkInfo.isSymbolicLink()) throw new Error('Symbolische Links sind im Dokumentenarchiv nicht erlaubt.')
    return resolved
  }

  private fileType(name: string): ArchiveFileType {
    const extension = path.extname(name).toLowerCase()
    if (extension === '.pdf') return 'pdf'
    if (extension === '.docx') return 'docx'
    if (extension === '.xlsx' || extension === '.xls') return 'xlsx'
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) return 'image'
    if (extension === '.json') return 'json'
    return 'other'
  }

  private async toEntry(absolutePath: string): Promise<ArchiveEntry> {
    const info = await fs.lstat(absolutePath)
    if (info.isSymbolicLink()) throw new Error('Symbolische Links sind im Dokumentenarchiv nicht erlaubt.')
    const kind: ArchiveEntryKind = info.isDirectory() ? 'directory' : 'file'
    if (kind === 'file' && !info.isFile()) throw new Error('Nicht unterstützter Archiv-Eintrag.')
    let itemCount: number | null = null
    if (kind === 'directory') {
      itemCount = (await fs.readdir(absolutePath, { withFileTypes: true }))
        .filter(entry => !entry.isSymbolicLink() && !entry.name.startsWith('.'))
        .length
    }
    return {
      name: path.basename(absolutePath),
      relativePath: path.relative(this.root, absolutePath),
      kind,
      fileType: kind === 'file' ? this.fileType(absolutePath) : 'other',
      size: kind === 'file' ? info.size : null,
      modifiedAt: info.mtime,
      itemCount,
    }
  }

  async ensureDirectory(relativeDirectory: string): Promise<void> {
    const directory = this.resolve(relativeDirectory)
    await fs.mkdir(directory, { recursive: true })
    const [rootReal, directoryReal] = await Promise.all([fs.realpath(this.root), fs.realpath(directory)])
    if (directoryReal !== rootReal && !directoryReal.startsWith(`${rootReal}${path.sep}`)) {
      throw new Error('Symbolischer Link verlässt das Archivverzeichnis.')
    }
  }

  async writeFile(relativePath: string, contents: Uint8Array, mode: ArchiveWriteMode): Promise<void> {
    const destination = this.resolve(relativePath)
    const directory = path.dirname(destination)
    await this.ensureDirectory(path.relative(this.root, directory))
    const temporary = path.join(directory, `.${path.basename(destination)}.${crypto.randomUUID()}.tmp`)
    try {
      await fs.writeFile(temporary, contents, { flag: 'wx', mode: 0o600 })
      if (mode === 'exclusive') {
        try {
          await fs.link(temporary, destination)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new Error(`Finale Archivdatei existiert bereits: ${path.basename(destination)}`)
          }
          throw error
        }
        await fs.unlink(temporary)
      } else {
        await fs.rename(temporary, destination)
      }
    } finally {
      await fs.unlink(temporary).catch(() => undefined)
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try { await fs.access(this.resolve(relativePath)); return true } catch { return false }
  }

  async listDirectory(relativeDirectory: string): Promise<ArchiveEntry[]> {
    const directory = await this.resolveExisting(relativeDirectory || '.')
    const info = await fs.lstat(directory)
    if (!info.isDirectory()) throw new Error('Der Archivpfad ist kein Verzeichnis.')
    const children = await fs.readdir(directory, { withFileTypes: true })
    const entries: ArchiveEntry[] = []
    for (const child of children) {
      if (child.name.startsWith('.') || child.isSymbolicLink()) continue
      const entry = await this.toEntry(path.join(directory, child.name))
      if (entry.kind === 'directory' || entry.fileType !== 'other') entries.push(entry)
    }
    return entries
  }

  async stat(relativePath: string): Promise<ArchiveEntry> {
    return this.toEntry(await this.resolveExisting(relativePath || '.'))
  }

  async readFile(relativePath: string): Promise<Buffer> {
    const file = await this.resolveExisting(relativePath)
    const info = await fs.lstat(file)
    if (!info.isFile()) throw new Error('Der Archivpfad ist keine Datei.')
    if (this.fileType(file) === 'other') throw new Error('Dieser Dateityp wird nicht unterstützt.')
    return fs.readFile(file)
  }

  async deleteFile(relativePath: string): Promise<void> {
    const file = await this.resolveExisting(relativePath)
    const info = await fs.lstat(file)
    if (!info.isFile()) throw new Error('Der Archivpfad ist keine Datei.')
    await fs.unlink(file)
  }

  async search(query: string, options: ArchiveSearchOptions = {}): Promise<ArchiveEntry[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase('de-DE')
    if (!normalizedQuery) return []
    const maxResults = Math.min(Math.max(options.maxResults ?? 200, 1), 500)
    const maxEntries = Math.min(Math.max(options.maxEntries ?? 10_000, 1), 50_000)
    const root = await this.resolveExisting('.')
    const pending = [root]
    const matches: ArchiveEntry[] = []
    let visited = 0
    while (pending.length > 0 && matches.length < maxResults && visited < maxEntries) {
      const directory = pending.shift()!
      const children = await fs.readdir(directory, { withFileTypes: true })
      for (const child of children) {
        if (child.name.startsWith('.') || child.isSymbolicLink()) continue
        visited += 1
        if (visited > maxEntries) break
        const absolutePath = path.join(directory, child.name)
        if (child.isDirectory()) {
          pending.push(absolutePath)
          continue
        }
        if (!child.isFile() || this.fileType(child.name) === 'other') continue
        const relativePath = path.relative(this.root, absolutePath)
        if (relativePath.toLocaleLowerCase('de-DE').includes(normalizedQuery)) {
          matches.push(await this.toEntry(absolutePath))
          if (matches.length >= maxResults) break
        }
      }
    }
    return matches
  }

  async getStatistics(): Promise<ArchiveStatistics> {
    const root = await this.resolveExisting('.')
    const pending = [root]
    let fileCount = 0
    let totalSize = 0
    while (pending.length > 0) {
      const directory = pending.shift()!
      const children = await fs.readdir(directory, { withFileTypes: true })
      for (const child of children) {
        if (child.name.startsWith('.') || child.isSymbolicLink()) continue
        const absolutePath = path.join(directory, child.name)
        if (child.isDirectory()) pending.push(absolutePath)
        else if (child.isFile() && this.fileType(child.name) !== 'other') {
          const info = await fs.stat(absolutePath)
          fileCount += 1
          totalSize += info.size
        }
      }
    }
    return { fileCount, totalSize }
  }

  async healthCheck(createTestFile = false): Promise<{ ok: boolean; message: string }> {
    try {
      await this.ensureDirectory('.')
      if (createTestFile) {
        const name = `.twir-archive-test-${crypto.randomUUID()}.tmp`
        await this.writeFile(name, Buffer.from('TWIR archive health check\n'), 'exclusive')
        await fs.unlink(this.resolve(name))
      } else {
        await fs.access(this.root, fs.constants.R_OK | fs.constants.W_OK)
      }
      return { ok: true, message: 'Archivpfad ist erreichbar und beschreibbar.' }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Archivpfad ist nicht erreichbar.' }
    }
  }
}
