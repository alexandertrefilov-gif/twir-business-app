// app/(dashboard)/settings/page.tsx
import type { Metadata }  from 'next'
import { PageHeader }     from '@/components/shared/PageHeader'
import { SettingsForm }   from '@/components/settings/SettingsForm'
import { getCompanyLogoScale, getSettings } from '@/lib/services/settings.service'
import { getSequenceStatus } from '@/lib/services/number-sequence.service'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'

export const metadata: Metadata = { title: 'Einstellungen' }

export default async function SettingsPage() {
  await requirePermission(Resource.SETTINGS, Action.READ)

  const [settings, sequences, logoScale] = await Promise.all([
    getSettings(),
    getSequenceStatus(),
    getCompanyLogoScale(),
  ])

  return (
    <div>
      <PageHeader
        title="Systemeinstellungen"
        description="Firmendaten, Bankverbindung, Nummernkreise und Rechnungsstandards"
        breadcrumbs={[{ label: 'Einstellungen' }]}
      />

      <div className="p-6 max-w-4xl">
        <SettingsForm
          defaults={{
            companyName:           settings.companyName,
            legalForm:             settings.legalForm       ?? '',
            businessActivity:      settings.businessActivity ?? '',
            street:                settings.street          ?? '',
            houseNumber:           settings.houseNumber     ?? '',
            postalCode:            settings.postalCode      ?? '',
            city:                  settings.city            ?? '',
            country:               settings.country,
            vatId:                 settings.vatId           ?? '',
            taxNumber:             settings.taxNumber       ?? '',
            taxOffice:             settings.taxOffice       ?? '',
            bankName:              settings.bankName        ?? '',
            iban:                  settings.iban            ?? '',
            bic:                   settings.bic             ?? '',
            email:                 settings.email           ?? '',
            phone:                 settings.phone           ?? '',
            fax:                   settings.fax             ?? '',
            website:               settings.website         ?? '',
            registerCourt:         settings.registerCourt   ?? '',
            registerNumber:        settings.registerNumber  ?? '',
            managingDirector:      settings.managingDirector ?? '',
            supplierNumber:        settings.supplierNumber   ?? '',
            invoicePrefix:         settings.invoicePrefix,
            offerPrefix:           settings.offerPrefix,
            orderPrefix:           settings.orderPrefix,
            serviceReportPrefix:   settings.serviceReportPrefix,
            defaultPaymentTermDays: settings.defaultPaymentTermDays,
            defaultTaxRate:        settings.defaultTaxRate.toNumber(),
            defaultInvoiceIntro:   settings.defaultInvoiceIntro ?? '',
            defaultInvoiceOutro:   settings.defaultInvoiceOutro ?? '',
            defaultOfferIntro:     settings.defaultOfferIntro  ?? '',
            defaultOfferOutro:     settings.defaultOfferOutro  ?? '',
            logoPath:              settings.logoPath            ?? '',
            logoScale,
          }}
          sequences={sequences.map((s) => ({
            type:       s.type,
            year:       s.year,
            prefix:     s.prefix,
            lastNumber: s.lastNumber,
          }))}
        />
      </div>
    </div>
  )
}
