export function offerNumberForDisplay(value: string): string {
  const number = value.trim()
  const legacyFormat = /^([A-Za-z]+)\s+(.+)$/.exec(number)
  return legacyFormat ? `${legacyFormat[1]}-${legacyFormat[2]}` : number
}

export function offerDisplayName(offerNumber: string, projectDesignation: string | null): string {
  const number = offerNumberForDisplay(offerNumber)
  const designation = projectDesignation?.trim()
  return designation ? `${number} – ${designation}` : number
}
