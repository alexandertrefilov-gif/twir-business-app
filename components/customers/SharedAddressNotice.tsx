export type AddressCoUser = { number: string; name: string }

export function SharedAddressNotice({ sharedWith }: { sharedWith: AddressCoUser[] }) {
  if (sharedWith.length === 0) return null
  return (
    <p data-shared-address-notice className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <span className="font-600">Gemeinsam genutzte Adresse.</span>{' '}
      Diese Adresse wird auch von {sharedWith.map(customer => `${customer.number} · ${customer.name}`).join(', ')} verwendet.
      Änderungen an Firma, Zusatz, Ansprechpartner, Straße, Hausnummer, PLZ, Ort, Land, E-Mail und Telefon gelten dort ebenfalls.
      Bezeichnung, Auswählbarkeit und Standardadresse bleiben nur für diesen Kunden gültig.
    </p>
  )
}
