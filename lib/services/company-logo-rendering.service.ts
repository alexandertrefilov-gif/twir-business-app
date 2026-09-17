import sharp from 'sharp'
import fs from 'fs/promises'
import path from 'path'
import {
  getCompanyLogoMetadata,
  type CompanyLogoMetadata,
} from '@/lib/services/settings.service'

const MAX_LOGO_PIXELS = 100_000_000
const MAX_RENDERED_LOGO_BYTES = 4 * 1024 * 1024

export interface RenderableCompanyLogo extends CompanyLogoMetadata {
  contents: Buffer
  mimeType: 'image/png' | 'image/jpeg'
  trimmed: boolean
}

export interface LoadedCompanyLogo extends CompanyLogoMetadata {
  dataUri: string
}

export async function loadCompanyLogoForPdf(
  storageKey?: string | null,
): Promise<LoadedCompanyLogo | undefined> {
  if (!storageKey || (process.env.STORAGE_DRIVER ?? 'local') !== 'local') return undefined

  const storageRoot = path.resolve(process.env.STORAGE_LOCAL_PATH ?? './storage/documents')
  const logoPath = path.resolve(storageRoot, storageKey)
  if (!logoPath.startsWith(`${storageRoot}${path.sep}`)) return undefined

  const extension = path.extname(logoPath).toLowerCase()
  const mimeType = extension === '.png'
    ? 'image/png'
    : extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : null
  if (!mimeType) return undefined

  try {
    const buffer = await fs.readFile(logoPath)
    if (buffer.length > 2 * 1024 * 1024) return undefined
    const metadata = getCompanyLogoMetadata(buffer, mimeType)
    if (!metadata) return undefined
    const renderable = await prepareCompanyLogoForRendering(buffer, mimeType, metadata)
    return {
      dataUri: `data:${renderable.mimeType};base64,${renderable.contents.toString('base64')}`,
      width: renderable.width,
      height: renderable.height,
    }
  } catch {
    return undefined
  }
}

/**
 * Entfernt ausschließlich äußere, zur linken oberen Ecke passende Leerflächen
 * aus der PDF-Rendition. Die hochgeladene Originaldatei bleibt unverändert.
 */
export async function prepareCompanyLogoForRendering(
  contents: Uint8Array,
  mimeType: string,
  source: CompanyLogoMetadata,
): Promise<RenderableCompanyLogo> {
  const original = Buffer.from(contents)
  const fallback = (): RenderableCompanyLogo => ({
    contents: original,
    mimeType: mimeType as 'image/png' | 'image/jpeg',
    width: source.width,
    height: source.height,
    trimmed: false,
  })

  if (
    (mimeType !== 'image/png' && mimeType !== 'image/jpeg') ||
    source.width * source.height > MAX_LOGO_PIXELS
  ) {
    return fallback()
  }

  try {
    const { data, info } = await sharp(original, {
      failOn: 'warning',
      limitInputPixels: MAX_LOGO_PIXELS,
    })
      .trim({ threshold: 10 })
      .toBuffer({ resolveWithObject: true })

    if (
      !info.width ||
      !info.height ||
      data.length > MAX_RENDERED_LOGO_BYTES ||
      (info.format !== 'png' && info.format !== 'jpeg')
    ) {
      return fallback()
    }

    return {
      contents: data,
      mimeType: info.format === 'png' ? 'image/png' : 'image/jpeg',
      width: info.width,
      height: info.height,
      trimmed: info.width !== source.width || info.height !== source.height,
    }
  } catch {
    return fallback()
  }
}
