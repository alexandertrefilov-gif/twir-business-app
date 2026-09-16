import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGgaCabinetDetail, cabinetEditorRoles } from '@/lib/services/gga-cabinet.service'
import { GgaCabinetIntakeWizard } from '@/components/collaboration/GgaCabinetIntakeWizard'
import { NotFoundError } from '@/lib/auth/permissions'

function toDecimalString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}
function toDateInput(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null
}

export default async function GgaCabinetIntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let cabinet: Awaited<ReturnType<typeof getGgaCabinetDetail>>
  try {
    cabinet = await getGgaCabinetDetail(id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }
  const canEdit = (cabinetEditorRoles as readonly string[]).includes(cabinet.role)

  return <div>
    <p className="text-xs text-muted-foreground"><Link href={`/collaboration/cabinets/${cabinet.id}`} className="hover:underline">{cabinet.kennung}</Link> / Bestandsaufnahme</p>
    <h1 className="mt-1 text-3xl font-600 tracking-tight">Bestandsaufnahme — {cabinet.kennung}</h1>
    <p className="mt-2 text-sm text-muted-foreground">Geführte Aufnahme des vorgefundenen Zustands. Soll-Maßnahmen werden danach separat am Schrank geplant.</p>

    <div className="mt-6">
      <GgaCabinetIntakeWizard
        cabinetId={cabinet.id}
        projectId={cabinet.projectId}
        canEdit={canEdit}
        bestandsaufnahmeAbgeschlossen={cabinet.status.bestandsaufnahmeAbgeschlossen}
        initial={{
          kennung: cabinet.kennung, bezeichnung: cabinet.bezeichnung,
          herstellerName: cabinet.herstellerName, herstellerTyp: cabinet.herstellerTyp, seriennummer: cabinet.seriennummer, baujahr: cabinet.baujahr,
          gebaeude: cabinet.gebaeude, ebene: cabinet.ebene, raumbezeichnung: cabinet.raumbezeichnung, standortBeschreibung: cabinet.standortBeschreibung,
          nutzungsart: cabinet.nutzungsart, lagerklasse: cabinet.lagerklasse, maxLagermengeKg: toDecimalString(cabinet.maxLagermengeKg),
          abluftVorhanden: cabinet.abluftVorhanden, abluftUeberwachung: cabinet.abluftUeberwachung,
          elektrischAusgestattet: cabinet.elektrischAusgestattet, spannungVolt: toDecimalString(cabinet.spannungVolt), potentialausgleich: cabinet.potentialausgleich,
          exAssessmentStatus: cabinet.exAssessmentStatus, exZoneKlassifikation: cabinet.exZoneKlassifikation,
          pruefintervallMonate: cabinet.pruefintervallMonate, letztePruefungAm: toDateInput(cabinet.letztePruefungAm), pruefpflichtNorm: cabinet.pruefpflichtNorm,
          bestandsBeschreibung: cabinet.bestandsBeschreibung,
          responsibleMembershipId: cabinet.responsibleMembershipId,
        }}
      />
    </div>
  </div>
}
