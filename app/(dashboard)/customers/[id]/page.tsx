// app/(dashboard)/customers/[id]/page.tsx
import type { Metadata }  from 'next'
import Link               from 'next/link'
import { notFound }       from 'next/navigation'
import { PageHeader }     from '@/components/shared/PageHeader'
import { getCustomerById } from '@/lib/services/customer.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { DeleteCustomerButton } from '@/components/customers/DeleteCustomerButton'
import { format }         from 'date-fns'
import { de }             from 'date-fns/locale'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  await requirePermission(Resource.CUSTOMER, Action.READ)

  try {
    const c = await getCustomerById(params.id)
    return { title: c.name }
  } catch {
    return { title: 'Kunde' }
  }
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  await requirePermission(Resource.CUSTOMER, Action.READ)

  let customer
  try {
    customer = await getCustomerById(params.id)
  } catch {
    notFound()
  }

  const [canEdit, canDelete] = await Promise.all([
    hasPermission(Resource.CUSTOMER, Action.UPDATE),
    hasPermission(Resource.CUSTOMER, Action.DELETE),
  ])

  const primaryContact = customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0]

  return (
    <div>
      <PageHeader
        title={customer.name}
        description={[customer.legalForm, customer.number].filter(Boolean).join(' · ')}
        breadcrumbs={[
          { label: 'Kunden', href: '/customers' },
          { label: customer.name },
        ]}
        actions={
          <div className="flex gap-2">
            {canEdit && (
              <Link
                href={`/customers/${customer.id}/edit`}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-stone-200 bg-white text-sm font-500 text-foreground hover:bg-stone-50 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
                </svg>
                Bearbeiten
              </Link>
            )}
            {canDelete && (
              <DeleteCustomerButton customerId={customer.id} />
            )}
          </div>
        }
      />

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* ── Main info ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Stammdaten */}
            <InfoCard title="Stammdaten">
              <InfoGrid>
                <InfoItem label="Kundennummer" value={customer.number} mono />
                <InfoItem label="Kurzname"     value={customer.name} />
                {customer.legalName  && <InfoItem label="Firmenname"  value={customer.legalName} />}
                {customer.legalForm  && <InfoItem label="Rechtsform"  value={customer.legalForm} />}
                {customer.vatId      && <InfoItem label="USt-IdNr."   value={customer.vatId} mono />}
                {customer.taxNumber  && <InfoItem label="Steuernummer" value={customer.taxNumber} mono />}
              </InfoGrid>
            </InfoCard>

            {/* Adresse */}
            {(customer.street || customer.city) && (
              <InfoCard title="Adresse">
                <address className="not-italic text-sm text-foreground leading-6">
                  {customer.street && (
                    <>{customer.street} {customer.houseNumber}<br /></>
                  )}
                  {customer.postalCode} {customer.city}<br />
                  {customer.country !== 'DE' && customer.country}
                </address>
              </InfoCard>
            )}

            {/* Kontaktdaten */}
            <InfoCard title="Kontaktdaten">
              <InfoGrid>
                {customer.email   && <InfoItem label="E-Mail"  value={customer.email} />}
                {customer.phone   && <InfoItem label="Telefon" value={customer.phone} mono />}
                {customer.fax     && <InfoItem label="Fax"     value={customer.fax}   mono />}
                {customer.website && <InfoItem label="Website" value={customer.website} />}
              </InfoGrid>
              {!customer.email && !customer.phone && (
                <p className="text-sm text-muted-foreground">Keine Kontaktdaten hinterlegt.</p>
              )}
            </InfoCard>

            {/* Ansprechpartner */}
            <InfoCard title={`Ansprechpartner (${customer.contacts.length})`}>
              {customer.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Ansprechpartner hinterlegt.</p>
              ) : (
                <div className="space-y-3">
                  {customer.contacts.map((c) => (
                    <div key={c.id} className="flex items-start gap-3 p-3 rounded-md bg-stone-50 border border-stone-100">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-600 shrink-0">
                        {(c.firstName[0] + c.lastName[0]).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-500 text-foreground">
                          {c.salutation ? `${c.salutation} ` : ''}{c.firstName} {c.lastName}
                          {c.isPrimary && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-600">
                              Primär
                            </span>
                          )}
                        </p>
                        {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                        <div className="flex gap-3 mt-1">
                          {c.email  && <span className="text-xs text-muted-foreground">{c.email}</span>}
                          {c.phone  && <span className="text-xs text-muted-foreground mono">{c.phone}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </InfoCard>

            {/* Notizen */}
            {customer.notes && (
              <InfoCard title="Interne Notizen">
                <p className="text-sm text-foreground whitespace-pre-wrap">{customer.notes}</p>
              </InfoCard>
            )}

          </div>

          {/* ── Sidebar: stats + meta ── */}
          <div className="space-y-4">

            {/* Aktivität */}
            <InfoCard title="Aktivität">
              <div className="grid grid-cols-3 gap-2">
                <StatMini label="Angebote" n={customer._count.offers} href={`/offers?customer=${customer.id}`} />
                <StatMini label="Aufträge" n={customer._count.orders} href={`/orders?customer=${customer.id}`} />
                <StatMini label="Rechnungen" n={customer._count.invoices} href={`/invoices?customer=${customer.id}`} />
              </div>
            </InfoCard>

            {/* Metadaten */}
            <InfoCard title="Details">
              <InfoGrid cols={1}>
                <InfoItem label="Status" value={customer.isActive ? 'Aktiv' : 'Inaktiv'} />
                <InfoItem
                  label="Angelegt"
                  value={format(new Date(customer.createdAt), 'dd.MM.yyyy', { locale: de })}
                />
                <InfoItem label="Land" value={customer.country} />
              </InfoGrid>
            </InfoCard>

            {/* Quick actions */}
            <div className="card-base p-4 space-y-2">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3">
                Aktionen
              </p>
              <QuickAction
                href={`/offers/new?customer=${customer.id}`}
                label="Angebot erstellen"
              />
              <QuickAction
                href={`/orders/new?customer=${customer.id}`}
                label="Auftrag anlegen"
              />
              <QuickAction
                href={`/invoices/new?customer=${customer.id}`}
                label="Rechnung erstellen"
              />
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-base overflow-hidden">
      <div className="px-5 py-3 border-b border-stone-100">
        <h2 className="text-sm font-600 text-foreground">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function InfoGrid({ cols = 2, children }: { cols?: 1 | 2; children: React.ReactNode }) {
  return (
    <dl className={`grid gap-y-3 gap-x-6 ${cols === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
      {children}
    </dl>
  )
}

function InfoItem({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm text-foreground ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}

function StatMini({ label, n, href }: { label: string; n: number; href: string }) {
  return (
    <Link href={href} className="block text-center p-2.5 rounded-md bg-stone-50 hover:bg-stone-100 transition-colors border border-stone-100">
      <p className="text-lg font-600 mono text-foreground">{n}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
    </Link>
  )
}

function QuickAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-sm text-foreground hover:bg-stone-50 border border-stone-200 transition-colors"
    >
      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
      </svg>
      {label}
    </Link>
  )
}
