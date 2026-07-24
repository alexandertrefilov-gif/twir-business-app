// lib/services/number-sequence.service.ts
// Nummernkreis-Service — atomar, race-condition-sicher
//
// Kritisch: Rechnungsnummern DÜRFEN NICHT doppelt vergeben werden.
// Lösung: SELECT ... FOR UPDATE (Row-Level-Lock) innerhalb einer Transaktion.

import { prisma } from '@/lib/db/prisma'
import { NumberSequenceType } from '@/types/enums'
import { Prisma } from '@prisma/client'

/**
 * Gibt die nächste Nummer für einen Nummernkreis zurück.
 *
 * Verwendet einen exklusiven Row-Lock (SELECT FOR UPDATE) um
 * Race Conditions bei parallelen Requests zu verhindern.
 *
 * MUSS innerhalb einer Transaktion aufgerufen werden, wenn
 * die Nummer an ein Dokument (Rechnung, Angebot, Auftrag) gebunden wird.
 *
 * Beispiel:
 *   const invoiceNumber = await prisma.$transaction(async (tx) => {
 *     return nextNumber(NumberSequenceType.INVOICE, tx)
 *   })
 */
export async function nextNumber(
  type: NumberSequenceType,
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear()

  // Zeile sperren (FOR UPDATE) — verhindert parallele Vergaben
  const existing = await tx.$queryRaw<
    Array<{
      id: string
      last_number: number
      prefix: string
      format: string
    }>
  >`
    SELECT id, last_number, prefix, format
    FROM number_sequences
    WHERE type = ${type}::"NumberSequenceType"
      AND year = ${year}
    FOR UPDATE
  `

  let sequence: { id: string; lastNumber: number; prefix: string; format: string }

  if (existing.length === 0) {
    // Ersten Eintrag für dieses Jahr anlegen
    const settings = await tx.companySetting.findFirst()
    const prefix = getPrefixFromSettings(type, settings)

    const created = await tx.numberSequence.create({
      data: { type, year, prefix, lastNumber: 0 },
    })
    sequence = {
      id:         created.id,
      lastNumber: created.lastNumber,
      prefix:     created.prefix,
      format:     created.format,
    }
  } else {
    const row = existing[0]
    sequence = {
      id:         row.id,
      lastNumber: row.last_number,
      prefix:     row.prefix,
      format:     row.format,
    }
  }

  // Inkrementieren
  const newNumber = sequence.lastNumber + 1

  await tx.numberSequence.update({
    where: { id: sequence.id },
    data:  { lastNumber: newNumber },
  })

  return formatNumber(sequence.format, sequence.prefix, year, newNumber)
}

/**
 * Formatiert eine Nummer nach dem Template.
 * Standard-Template: "{prefix}{year}-{number:04}"
 * Ergibt z.B.: "RE2024-0001", "AN2024-0042"
 */
function formatNumber(
  format: string,
  prefix: string,
  year: number,
  number: number,
): string {
  // {number:04} → vierstellig mit führenden Nullen
  const paddingMatch = format.match(/\{number:(\d+)\}/)
  const padding = paddingMatch ? parseInt(paddingMatch[1]) : 4
  const paddedNumber = String(number).padStart(padding, '0')

  return format
    .replace('{prefix}', prefix)
    .replace('{year}', String(year))
    .replace(/\{number:\d+\}/, paddedNumber)
    .replace('{number}', paddedNumber)
}

/**
 * Liest die Präfixe aus den Firmeneinstellungen.
 */
function getPrefixFromSettings(
  type: NumberSequenceType,
  settings: { invoicePrefix: string; offerPrefix: string; orderPrefix: string; serviceReportPrefix: string } | null,
): string {
  const defaults: Record<NumberSequenceType, string> = {
    INVOICE:        'RE',
    OFFER:          'AN',
    ORDER:          'AU',
    SERVICE_REPORT: 'LN',
  }

  if (!settings) return defaults[type]

  const map: Record<NumberSequenceType, string> = {
    INVOICE:        settings.invoicePrefix,
    OFFER:          settings.offerPrefix,
    ORDER:          settings.orderPrefix,
    SERVICE_REPORT: settings.serviceReportPrefix,
  }
  return map[type] || defaults[type]
}

/**
 * Zeigt die aktuelle Zählerstand-Übersicht an (für Einstellungen).
 * Nur lesen — keine Änderungen.
 */
export async function getSequenceStatus() {
  const year = new Date().getFullYear()
  return prisma.numberSequence.findMany({
    where:   { year },
    orderBy: { type: 'asc' },
  })
}
