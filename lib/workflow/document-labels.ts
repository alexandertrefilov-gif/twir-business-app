// WF-1A: zentrale Anzeige-Bezeichnungen für Geschäftsdokumente.
// "Auftragsbestätigung" betrifft ausschließlich PDF-Titel, Vorschau und
// Archivbezeichnung. Status-, Listen- und Menütexte bleiben unverändert
// ("Auftrag"), das Order-Modell wird nicht umbenannt.
export const ORDER_CONFIRMATION_LABEL = 'Auftragsbestätigung'
export const ORDER_LABEL = 'Auftrag'
export const OFFER_LABEL = 'Angebot'
export const SERVICE_REPORT_LABEL = 'Leistungsnachweis'
export const CUSTOMER_ORDER_LABEL = 'Kundenbestellung'
export const CUSTOMER_ORDER_NUMBER_LABEL = 'Kundenbestellnummer'
export const CUSTOMER_ORDER_DATE_LABEL = 'Kundenbestelldatum'

export function formatCustomerOrderReference(number?: string | null, date?: string | null): string | null {
  const parts: string[] = []
  if (number?.trim()) parts.push(`Nr. ${number.trim()}`)
  if (date?.trim()) parts.push(`vom ${date.trim()}`)
  return parts.length > 0 ? `Ihre Bestellung ${parts.join(' ')}` : null
}
