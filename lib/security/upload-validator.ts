// lib/security/upload-validator.ts
// Serverseitige Upload-Sicherheitsprüfung
//
// ALLE Uploads müssen durch diesen Validator laufen.
// Kein Frontend-Bypass möglich — prüfung ist serverseitig.
//
// Schützt gegen:
//   - Dateityp-Spoofing (MIME ≠ Extension)
//   - Path Traversal in Dateinamen
//   - Executable-Uploads (PHP, EXE, JS, etc.)
//   - Übermäßige Dateigröße
//   - Null-Bytes im Dateinamen

import path from 'path'

// ── Konfiguration ─────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024   // 20 MB hard limit

/** Erlaubte Dateierweiterungen + erwartete MIME-Types */
const ALLOWED_TYPES: Record<string, string[]> = {
  '.pdf':  ['application/pdf'],
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png':  ['image/png'],
  '.gif':  ['image/gif'],
  '.webp': ['image/webp'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.xls':  ['application/vnd.ms-excel'],
  '.doc':  ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.eml':  ['message/rfc822'],
  '.csv':  ['text/csv', 'text/plain', 'application/csv'],
  '.txt':  ['text/plain'],
  '.zip':  ['application/zip', 'application/x-zip-compressed'],
}

/** Explizit blockierte Extensions — auch wenn MIME ok wäre */
const BLOCKED_EXTENSIONS = new Set([
  '.php', '.php3', '.php4', '.php5', '.phtml',
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.zsh',
  '.js',  '.mjs', '.cjs', '.ts',  '.jsx', '.tsx',
  '.py',  '.rb',  '.pl',  '.lua', '.jar',
  '.dll', '.so',  '.dylib',
  '.htaccess', '.env', '.config',
])

// ── Types ─────────────────────────────────────────────────────

export interface UploadValidationResult {
  valid:         boolean
  error?:        string
  sanitizedName: string
}

// ── Validator ─────────────────────────────────────────────────

export function validateUpload(params: {
  originalName: string
  mimeType:     string
  sizeBytes:    number
  maxSizeBytes?: number
}): UploadValidationResult {
  const { originalName, mimeType, sizeBytes, maxSizeBytes = MAX_FILE_SIZE_BYTES } = params

  // 1. Sanitize filename first
  const sanitized = sanitizeFilename(originalName)
  if (!sanitized) {
    return { valid: false, error: 'Ungültiger Dateiname', sanitizedName: 'unnamed' }
  }

  // 2. Check for null bytes (path traversal attempt)
  if (originalName.includes('\0')) {
    return { valid: false, error: 'Ungültiger Dateiname (Null-Byte)', sanitizedName: sanitized }
  }

  // 3. Size check
  if (sizeBytes > maxSizeBytes) {
    const maxMB = (maxSizeBytes / 1024 / 1024).toFixed(0)
    return {
      valid: false,
      error: `Datei zu groß. Maximum: ${maxMB} MB`,
      sanitizedName: sanitized,
    }
  }

  if (sizeBytes === 0) {
    return { valid: false, error: 'Datei ist leer', sanitizedName: sanitized }
  }

  // 4. Extension check
  const ext = path.extname(sanitized).toLowerCase()

  if (!ext) {
    return { valid: false, error: 'Datei ohne Erweiterung nicht erlaubt', sanitizedName: sanitized }
  }

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      error: `Dateityp „${ext}" ist nicht erlaubt`,
      sanitizedName: sanitized,
    }
  }

  const allowedMimes = ALLOWED_TYPES[ext]
  if (!allowedMimes) {
    return {
      valid: false,
      error: `Dateityp „${ext}" wird nicht unterstützt`,
      sanitizedName: sanitized,
    }
  }

  // 5. MIME-Type check (prevent MIME spoofing)
  const mimeNormalized = mimeType.split(';')[0].trim().toLowerCase()
  if (!allowedMimes.includes(mimeNormalized)) {
    return {
      valid: false,
      error: `MIME-Typ „${mimeType}" passt nicht zur Erweiterung „${ext}"`,
      sanitizedName: sanitized,
    }
  }

  return { valid: true, sanitizedName: sanitized }
}

// ── Filename sanitizer ─────────────────────────────────────────

/**
 * Bereinigt Dateinamen:
 * - Entfernt Pfad-Bestandteile (../ ./ /)
 * - Ersetzt ungültige Zeichen
 * - Begrenzt Länge
 * - Entfernt führende Punkte (hidden files)
 */
export function sanitizeFilename(name: string): string {
  // Strip any path components
  let clean = path.basename(name)

  // Remove null bytes
  clean = clean.replace(/\0/g, '')

  // Remove or replace dangerous characters
  // Keep: alphanumeric, dash, underscore, dot, space, German umlauts
  clean = clean.replace(/[^\w\s.\-äöüÄÖÜß]/gi, '_')

  // Collapse multiple underscores/spaces
  clean = clean.replace(/_{2,}/g, '_').replace(/\s{2,}/g, ' ').trim()

  // Remove leading dots (hidden files like .env, .htaccess)
  clean = clean.replace(/^\.+/, '')

  // Limit length
  if (clean.length > 200) {
    const ext  = path.extname(clean)
    const base = path.basename(clean, ext)
    clean      = base.slice(0, 200 - ext.length) + ext
  }

  return clean || 'unnamed'
}

// ── Path Traversal Guard ──────────────────────────────────────

/**
 * Prüft ob ein aufgelöster Dateipfad innerhalb des erlaubten Basis-Verzeichnisses liegt.
 * Schützt gegen ../ in storagePath.
 */
export function assertPathWithinBase(
  basePath:     string,
  resolvedPath: string,
): void {
  const resolvedBase = path.resolve(basePath)
  const resolved     = path.resolve(resolvedPath)

  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path traversal attempt detected: ${resolvedPath}`)
  }
}

// ── Content type verification ─────────────────────────────────

/** Gibt human-readable Label für MIME-Type zurück */
export function getMimeTypeLabel(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf':   'PDF',
    'image/jpeg':        'JPEG',
    'image/png':         'PNG',
    'image/gif':         'GIF',
    'image/webp':        'WebP',
    'text/csv':          'CSV',
    'text/plain':        'Textdatei',
    'application/zip':   'ZIP',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  }
  return map[mimeType.split(';')[0].trim()] ?? mimeType
}

/**
 * Magic-Byte-Inhaltsprüfung für alle in ALLOWED_TYPES erlaubten Formate.
 * MIME-Type/Extension allein sind clientseitig vorgetäuscht angebbar.
 *
 * Für Formate ohne verlässliche binäre Signatur (reiner Text: .txt/.csv)
 * gibt es keine sinnvolle Inhaltsprüfung jenseits der bereits erfolgten
 * Extension-/MIME-Validierung — hier wird bewusst true zurückgegeben,
 * statt eine Datei ohne echten Sicherheitsgewinn abzulehnen.
 */
export function validateUploadSignature(buffer: Uint8Array, mimeType: string): boolean {
  const mime = mimeType.split(';')[0].trim().toLowerCase()
  const starts = (...bytes: number[]) => bytes.every((byte, index) => buffer[index] === byte)
  if (mime === 'application/pdf') return starts(0x25, 0x50, 0x44, 0x46)
  if (mime === 'image/jpeg') return starts(0xff, 0xd8, 0xff)
  if (mime === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
  if (mime === 'image/gif') return starts(0x47, 0x49, 0x46, 0x38)
  if (mime === 'image/webp') return starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...buffer.slice(8, 12)) === 'WEBP'
  if (mime.includes('openxmlformats-officedocument')) return starts(0x50, 0x4b, 0x03, 0x04)
  if (mime === 'application/vnd.ms-excel' || mime === 'application/msword') return starts(0xd0, 0xcf, 0x11, 0xe0)
  if (mime === 'application/zip' || mime === 'application/x-zip-compressed') return starts(0x50, 0x4b, 0x03, 0x04)
  if (mime === 'text/plain' || mime === 'text/csv' || mime === 'application/csv') return true
  if (mime === 'message/rfc822') {
    const header = new TextDecoder('ascii').decode(buffer.slice(0, 4096))
    return /^(?:From|Return-Path|Received|Date|Message-ID|Subject|MIME-Version):/im.test(header)
  }
  return false
}
