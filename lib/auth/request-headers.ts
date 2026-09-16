type RequestWithHeaders = { headers?: Headers | Record<string, string | string[] | undefined> }

export function getRequestHeader(request: unknown, name: string): string | undefined {
  const headers = (request as RequestWithHeaders | null | undefined)?.headers
  if (!headers) return undefined
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? undefined
  }
  const record = headers as Record<string, string | string[] | undefined>
  const value = Object.entries(record).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1]
  return Array.isArray(value) ? value[0] : value
}
