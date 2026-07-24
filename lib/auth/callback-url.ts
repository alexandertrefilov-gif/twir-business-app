const FALLBACK_URL = '/'

/**
 * Erlaubt ausschließlich anwendungsinterne, absolute Pfade.
 * Externe, protokoll-relative und ausführbare URLs fallen auf "/" zurück.
 */
export function getSafeCallbackUrl(callbackUrl: string | null): string {
  if (
    !callbackUrl ||
    !callbackUrl.startsWith('/') ||
    callbackUrl.startsWith('//') ||
    callbackUrl.includes('\\') ||
    /[\u0000-\u001F\u007F]/.test(callbackUrl)
  ) {
    return FALLBACK_URL
  }

  return callbackUrl
}
