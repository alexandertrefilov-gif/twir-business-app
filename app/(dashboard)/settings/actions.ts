'use server'
// app/(dashboard)/settings/actions.ts

import { revalidatePath }   from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions }      from '@/lib/auth/options'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { SettingsUpdateSchema } from '@/lib/validators/settings.schema'
import {
  hasValidCompanyLogoSignature,
  saveCompanyLogo,
  saveCompanyLogoScale,
  updateSettings,
} from '@/lib/services/settings.service'
import { validateUpload } from '@/lib/security/upload-validator'

export interface ActionState {
  success?: boolean
  error?:   string
  fieldErrors?: Record<string, string[]>
}

export async function updateLogoScaleAction(scale: number): Promise<ActionState> {
  await requirePermission(Resource.SETTINGS, Action.UPDATE)
  const result = SettingsUpdateSchema.shape.logoScale.safeParse(scale)
  if (!result.success) {
    return { success: false, error: 'Logo-Größe muss zwischen 50 % und 200 % liegen.' }
  }
  try {
    await saveCompanyLogoScale(result.data)
    revalidatePath('/settings')
    return { success: true }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Logo-Größe konnte nicht gespeichert werden.',
    }
  }
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
      businessActivity:      formData.get('businessActivity')    || null,
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
      supplierNumber:        formData.get('supplierNumber')      || null,
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
      logoScale:             formData.get('logoScale')           || '140',
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

  const logo = formData.get('companyLogo')
  let logoContents: Uint8Array | null = null
  if (logo instanceof File && logo.size > 0) {
    const validation = validateUpload({
      originalName: logo.name,
      mimeType: logo.type,
      sizeBytes: logo.size,
      maxSizeBytes: 2 * 1024 * 1024,
    })
    if (
      !validation.valid ||
      (logo.type !== 'image/png' && logo.type !== 'image/jpeg')
    ) {
      return {
        success: false,
        error: validation.error ?? 'Als Firmenlogo sind nur PNG und JPEG erlaubt.',
      }
    }
    logoContents = new Uint8Array(await logo.arrayBuffer())
    if (!hasValidCompanyLogoSignature(logoContents, logo.type)) {
      return {
        success: false,
        error: 'Die Logo-Datei enthält keine gültigen PNG- oder JPEG-Bilddaten.',
      }
    }
  }

  try {
    await updateSettings(result.data, userId, userEmail)
    await saveCompanyLogoScale(result.data.logoScale)
    if (logo instanceof File && logoContents) {
      await saveCompanyLogo(logo, logoContents)
    }
    revalidatePath('/settings')
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Fehler beim Speichern' }
  }
}
