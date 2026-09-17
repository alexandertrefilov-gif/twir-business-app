export const COMPANY_LOGO_MIN_SCALE = 50
export const COMPANY_LOGO_MAX_SCALE = 400
export const COMPANY_LOGO_MAX_WIDTH_POINTS = 300
export const COMPANY_LOGO_MAX_HEIGHT_POINTS = 140

/**
 * Gemeinsame Darstellungslogik für Vorschau und finale React-PDF-Ausgabe.
 * Die Breite folgt der Einstellung; die Höhe folgt ausschließlich dem
 * Seitenverhältnis der hochgeladenen Quelldatei.
 */
export function getCompanyLogoDimensions(
  scale = 140,
  sourceWidth = 2,
  sourceHeight = 1,
) {
  const safeScale = Math.min(COMPANY_LOGO_MAX_SCALE, Math.max(COMPANY_LOGO_MIN_SCALE, scale))
  const safeWidth = Number.isFinite(sourceWidth) && sourceWidth > 0 ? sourceWidth : 2
  const safeHeight = Number.isFinite(sourceHeight) && sourceHeight > 0 ? sourceHeight : 1
  const aspectRatio = safeWidth / safeHeight
  const widthAtMaximumScale = Math.min(
    COMPANY_LOGO_MAX_WIDTH_POINTS,
    COMPANY_LOGO_MAX_HEIGHT_POINTS * aspectRatio,
  )
  const width = widthAtMaximumScale * safeScale / COMPANY_LOGO_MAX_SCALE
  return {
    width,
    height: width / aspectRatio,
  }
}
