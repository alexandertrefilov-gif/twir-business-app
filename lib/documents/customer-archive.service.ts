import { prisma } from '@/lib/db/prisma'
import { buildCustomerArchiveDirectory } from '@/lib/documents/archive-naming'
import { LocalFilesystemArchiveStorage } from '@/lib/documents/archive-storage'

export type CustomerArchiveResult =
  | { status: 'created'; relativePath: string }
  | { status: 'disabled' }
  | { status: 'failed'; error: string }

export async function ensureCustomerArchiveDirectory(customer: {
  number?: string | null
  name: string
  createdAt?: Date
}): Promise<CustomerArchiveResult> {
  const settings = await prisma.companySetting.findFirst({
    select: { documentArchiveEnabled: true, documentArchivePath: true },
  })
  if (!settings?.documentArchiveEnabled) return { status: 'disabled' }
  if (!settings.documentArchivePath) return { status: 'failed', error: 'Dokumentenarchiv ist aktiv, aber kein Basispfad konfiguriert.' }

  const relativePath = buildCustomerArchiveDirectory({
    year: (customer.createdAt ?? new Date()).getFullYear(),
    customerNumber: customer.number,
    customerName: customer.name,
  })
  try {
    await new LocalFilesystemArchiveStorage(settings.documentArchivePath).ensureDirectory(relativePath)
    return { status: 'created', relativePath }
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'Kundenordner konnte nicht angelegt werden.' }
  }
}
