// Betreiberportal-Dashboard: bewusst reduzierte, eigenständige Ansicht — keine
// Kopie der internen Cabinet-Liste. Zeigt nur, was der Betreiber für den
// Freigabeprozess braucht. Status kommt vollständig aus deriveCabinetStatus.
import Link from 'next/link'
import { getVisibleGgaCabinets } from '@/lib/services/gga-cabinet.service'
import { GGA_LIFECYCLE_STAGE_LABELS, GGA_BETREIBERSTATUS_LABELS, formatGgaBetriebsstatusLabel, GGA_BETRIEBSSTATUS_BADGE_CLASS } from '@/lib/collaboration/cabinet-workflow'

type Filter = 'alle' | 'aktion' | 'pruefung' | 'nacharbeit' | 'abgeschlossen'

const lifecycleBadgeClass: Record<string, string> = {
  BESTAND: 'bg-stone-100 text-stone-700', PLANUNG: 'bg-blue-100 text-blue-800', UMSETZUNG: 'bg-amber-100 text-amber-800',
  PRUEFUNG_ABNAHME: 'bg-purple-100 text-purple-800', ABGESCHLOSSEN: 'bg-green-100 text-green-800',
}

export default async function GgaBetreiberDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const filter = (typeof params.filter === 'string' ? params.filter : 'alle') as Filter
  const cabinets = await getVisibleGgaCabinets()

  const filtered = cabinets.filter((cabinet) => {
    if (filter === 'aktion') return cabinet.betreiberfreigabeAusstehend
    if (filter === 'pruefung') return cabinet.lifecycleStage === 'PRUEFUNG_ABNAHME' && !cabinet.betreiberfreigabeAusstehend && !cabinet.betreiberbeanstandung
    if (filter === 'nacharbeit') return cabinet.betreiberbeanstandung
    if (filter === 'abgeschlossen') return cabinet.lifecycleStage === 'ABGESCHLOSSEN'
    return true
  })

  const filterLink = (value: Filter, label: string) => <Link href={`/collaboration/betreiber?filter=${value}`} className={`rounded-full px-4 py-2 text-sm font-600 ${filter === value ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-700'}`}>{label}</Link>

  return <div>
    <h1 className="text-3xl font-600 tracking-tight">Gefahrstoffschränke</h1>
    <p className="mt-2 text-sm text-muted-foreground">Ihre GGA-Schränke mit aktuellem Status und ggf. anstehender Betreiberfreigabe.</p>

    <div className="mt-6 flex flex-wrap gap-2">
      {filterLink('alle', 'Alle')}
      {filterLink('aktion', 'Aktion erforderlich')}
      {filterLink('pruefung', 'Prüfung')}
      {filterLink('nacharbeit', 'Beanstandung / Nacharbeit')}
      {filterLink('abgeschlossen', 'Abgeschlossen')}
    </div>

    <div className="mt-4 grid gap-3">
      {filtered.map((cabinet) => <Link key={cabinet.id} href={`/collaboration/betreiber/${cabinet.id}`} className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-stone-300 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-lg font-600">{cabinet.kennung}</p>
            <p className="text-sm text-muted-foreground">{cabinet.standort ?? '–'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-600 ${GGA_BETRIEBSSTATUS_BADGE_CLASS[cabinet.betriebsstatus]}`}>{formatGgaBetriebsstatusLabel(cabinet.betriebsstatus, cabinet.betriebsstatusTageBisFaellig)}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-600 ${lifecycleBadgeClass[cabinet.lifecycleStage]}`}>{GGA_LIFECYCLE_STAGE_LABELS[cabinet.lifecycleStage]}</span>
            {cabinet.betreiberfreigabeAusstehend && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-600 text-amber-800">⚠ Freigabe erforderlich</span>}
            {cabinet.betreiberbeanstandung && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-600 text-red-800">⚠ Beanstandet</span>}
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{cabinet.betreiberstatus !== 'NICHT_ANGEFORDERT' ? GGA_BETREIBERSTATUS_LABELS[cabinet.betreiberstatus] + ' · ' : ''}{cabinet.naechsteAktion}</p>
      </Link>)}
      {filtered.length === 0 && <p className="rounded-xl border border-stone-200 bg-white px-5 py-8 text-center text-sm text-muted-foreground">Keine Schränke in dieser Ansicht.</p>}
    </div>
  </div>
}
