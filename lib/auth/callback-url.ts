export type AuthArea = 'internal' | 'collaboration'

const AREA_PATHS: Record<AuthArea, { prefix: string; fallback: string }> = {
  internal: { prefix: '/intern/', fallback: '/intern/dashboard' },
  collaboration: { prefix: '/collaboration/', fallback: '/collaboration/dashboard' },
}

/**
 * Erlaubt ausschließlich anwendungsinterne, absolute Pfade.
 * Externe, protokoll-relative und ausführbare URLs fallen auf "/" zurück.
 */
export function getSafeCallbackUrl(
  callbackUrl: string | null,
  area: AuthArea = 'internal',
): string {
  const { prefix, fallback } = AREA_PATHS[area]
  if (
    !callbackUrl ||
    !callbackUrl.startsWith('/') ||
    callbackUrl.startsWith('//') ||
    callbackUrl.includes('\\') ||
    /%(?:2f|5c)/i.test(callbackUrl) ||
    /[\u0000-\u001F\u007F]/.test(callbackUrl)
  ) {
    return fallback
  }

  const normalized = new URL(callbackUrl, 'https://twir.invalid')
  const pathname = normalized.pathname
  if (pathname !== prefix.slice(0, -1) && !pathname.startsWith(prefix)) {
    return fallback
  }

  return `${normalized.pathname}${normalized.search}${normalized.hash}`
}
