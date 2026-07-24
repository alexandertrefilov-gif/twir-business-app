'use server'
// app/(dashboard)/settings/actions.ts

import { revalidatePath }   from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { SettingsUpdateSchema } from '@/lib/validators/settings.schema'
import { updateSettings }   from '@/lib/services/settings.service'

export interface ActionState {
  success?: boolean
  error?:   string
  fieldErrors?: Record<string, string[]>
}

export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission(Resource.SETTINGS, Action.UPDATE)

  const session = await getServerSession(authOptions)
  if (!session?.user) return { success: false, error: 'Nicht angemeldet' }
  const { id: userId, email: userEmail } = session.user as { id: string; email: string }

  const raw = Object.fromEntries(
    Object.entries({
      companyName:           formData.get('companyName'),
      legalForm:             formData.get('legalForm')           || null,
      street:                formData.get('street')              || null,
      houseNumber:           formData.get('houseNumber')         || null,
      postalCode:            formData.get('postalCode')          || null,
      city:                  formData.get('city')                || null,
      country:               formData.get('country')             || 'DE',
      vatId:                 formData.get('vatId')               || null,
      taxNumber:             formData.get('taxNumber')           || null,
      taxOffice:             formData.get('taxOffice')           || null,
      bankName:              formData.get('bankName')            || null,
      iban:                  formData.get('iban')                || null,
      bic:                   formData.get('bic')                 || null,
      email:                 formData.get('email')               || null,
      phone:                 formData.get('phone')               || null,
      fax:                   formData.get('fax')                 || null,
      website:               formData.get('website')             || null,
      registerCourt:         formData.get('registerCourt')       || null,
      registerNumber:        formData.get('registerNumber')      || null,
      managingDirector:      formData.get('managingDirector')    || null,
      invoicePrefix:         formData.get('invoicePrefix')       || 'RE',
      offerPrefix:           formData.get('offerPrefix')         || 'AN',
      orderPrefix:           formData.get('orderPrefix')         || 'AU',
      serviceReportPrefix:   formData.get('serviceReportPrefix') || 'LN',
      defaultPaymentTermDays: formData.get('defaultPaymentTermDays'),
      defaultTaxRate:         formData.get('defaultTaxRate'),
      defaultInvoiceIntro:   formData.get('defaultInvoiceIntro') || null,
      defaultInvoiceOutro:   formData.get('defaultInvoiceOutro') || null,
      defaultOfferIntro:     formData.get('defaultOfferIntro')   || null,
      defaultOfferOutro:     formData.get('defaultOfferOutro')   || null,
    }).filter(([, v]) => v !== undefined),
  )

  const result = SettingsUpdateSchema.safeParse(raw)
  if (!result.success) {
    return {
      success:     false,
      fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]>,
      error:       'Bitte alle Pflichtfelder korrekt ausfüllen.',
    }
  }

  try {
    await updateSettings(result.data, userId, userEmail)
    revalidatePath('/settings')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Speichern' }
  }
}
