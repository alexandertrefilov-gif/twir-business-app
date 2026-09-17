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
  const now = new Date()
  const year = now.getFullYear()
  // Angebotsnummern laufen monatlich. Das bestehende eindeutige Feld `year`
  // wird dafür ohne Schemaänderung als YYYYMM-Periodenschlüssel verwendet.
  const period = type === NumberSequenceType.OFFER
    ? year * 100 + now.getMonth() + 1
    : year

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
      AND year = ${period}
    FOR UPDATE
  `

  let sequence: { id: string; lastNumber: number; prefix: string; format: string }

  if (existing.length === 0) {
    // Ersten Eintrag für diesen Nummernzeitraum anlegen.
    // FOR UPDATE kann eine noch nicht existierende Zeile nicht sperren — ein
    // paralleler Request kann daher denselben Bootstrap gleichzeitig auslösen.
    // @@unique([type, year]) verhindert einen doppelten Eintrag; der unterlegene
    // Request liest die inzwischen angelegte Zeile stattdessen gesperrt neu.
    const settings = await tx.companySetting.findFirst()
    const prefix = getPrefixFromSettings(type, settings)

    try {
      const created = await tx.numberSequence.create({
        data: { type, year: period, prefix, lastNumber: 0 },
      })
      sequence = {
        id:         created.id,
        lastNumber: created.lastNumber,
        prefix:     created.prefix,
        format:     created.format,
      }
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error
      const retried = await tx.$queryRaw<
        Array<{ id: string; last_number: number; prefix: string; format: string }>
      >`
        SELECT id, last_number, prefix, format
        FROM number_sequences
        WHERE type = ${type}::"NumberSequenceType"
          AND year = ${period}
        FOR UPDATE
      `
      if (retried.length === 0) throw error
      const row = retried[0]
      sequence = { id: row.id, lastNumber: row.last_number, prefix: row.prefix, format: row.format }
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

  return type === NumberSequenceType.OFFER
    ? formatOfferNumber(now, sequence.prefix, newNumber)
    : formatNumber(sequence.format, sequence.prefix, year, newNumber)
}

/**
 * Angebotsnummer: AN YYMMNN
 * Beispiel: erster Vorgang im Juli 2026 → AN 260701
 */
export function formatOfferNumber(date: Date, prefix: string, number: number): string {
  const shortYear = String(date.getFullYear()).slice(-2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const sequence = String(number).padStart(2, '0')
  return `${prefix} ${shortYear}${month}${sequence}`
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
  const now = new Date()
  const year = now.getFullYear()
  const offerPeriod = year * 100 + now.getMonth() + 1
  return prisma.numberSequence.findMany({
    where: {
      OR: [
        { year, type: { not: NumberSequenceType.OFFER } },
        { year: offerPeriod, type: NumberSequenceType.OFFER },
      ],
    },
    orderBy: { type: 'asc' },
  })
}
