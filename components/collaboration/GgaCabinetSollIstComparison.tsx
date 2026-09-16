// Reine Anzeigekomponente (kein Client-State). Stellt SOLL neben IST bzw.
// neben dem Prüfnachweis-Status — bewusst OHNE automatische fachliche
// Aussage wie "VDE-konform" oder "bestanden". Eine Abweichung wird nur
// sichtbar markiert, nie fachlich bewertet.
import type { ReactNode } from 'react'

type ChecklistLookup = Array<{ title: string; completed: boolean; stage: { code: string } }>

function findItem(items: ChecklistLookup, title: string) {
  return items.find((item) => item.stage.code === 'ABNAHME' && item.title === title)
}

function StatusPill({ done, label }: { done: boolean | undefined; label: string }) {
  if (done === undefined) return <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-muted-foreground">Kein Prüfpunkt vorhanden</span>
  return done
    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-600 text-green-800">✓ {label} geprüft</span>
    : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-600 text-amber-800">Nicht geprüft</span>
}

export function GgaCabinetSollIstComparison({ cabinet }: {
  cabinet: {
    abluftAnschlussdurchmesserSollMm: number | null
    abluftVolumenstromSollM3h: unknown
    abluftVolumenstromIstM3h: unknown
    montagefortschritt: number | null
    exAssessmentStatus: 'NOT_ASSESSED' | 'REQUIRED' | 'NOT_REQUIRED'
    elektrischAusgestattet: boolean
    potentialausgleich: boolean
    checklistItems: ChecklistLookup
  }
}) {
  const soll = cabinet.abluftVolumenstromSollM3h === null ? null : Number(cabinet.abluftVolumenstromSollM3h)
  const ist = cabinet.abluftVolumenstromIstM3h === null ? null : Number(cabinet.abluftVolumenstromIstM3h)
  const abweichung = soll !== null && ist !== null ? Math.round((ist - soll) * 100) / 100 : null
  const abweichungRelevant = abweichung !== null && Math.abs(abweichung) > 0

  const elektroGeprueft = findItem(cabinet.checklistItems, 'Elektro/VDE geprüft')?.completed
  const potentialausgleichGeprueft = findItem(cabinet.checklistItems, 'Potentialausgleich geprüft')?.completed
  const exGeprueft = findItem(cabinet.checklistItems, 'Ex-Anforderungen erfüllt')?.completed
  const kennzeichnungGeprueft = findItem(cabinet.checklistItems, 'Kennzeichnung geprüft')?.completed

  const row = (label: string, soll: ReactNode, ist: ReactNode, warn?: boolean) => <tr className={warn ? 'bg-amber-50' : undefined}>
    <td className="px-4 py-2 text-sm font-600">{label}</td>
    <td className="px-4 py-2 text-sm">{soll}</td>
    <td className="px-4 py-2 text-sm">{ist}</td>
  </tr>

  return <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
    <table className="min-w-full text-left text-sm">
      <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground">
        <tr><th className="px-4 py-2">Anforderung</th><th className="px-4 py-2">SOLL</th><th className="px-4 py-2">IST / Prüfnachweis</th></tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {row('Volumenstrom Abluft', soll === null ? '–' : `${soll} m³/h`, ist === null ? 'Nicht gemessen' : <>{ist} m³/h {abweichungRelevant && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-600 text-amber-800">Abweichung {abweichung! > 0 ? '+' : ''}{abweichung} m³/h</span>}</>, abweichungRelevant)}
        {row('Anschlussdurchmesser Abluft', cabinet.abluftAnschlussdurchmesserSollMm === null ? '–' : `${cabinet.abluftAnschlussdurchmesserSollMm} mm`, cabinet.montagefortschritt === 100 ? '✓ Umsetzung erledigt' : 'Umsetzung offen', cabinet.montagefortschritt !== 100)}
        {row('Ex-Schutz', GGA_EX_LABEL[cabinet.exAssessmentStatus], <StatusPill done={exGeprueft} label="Ex-Anforderungen" />, cabinet.exAssessmentStatus === 'REQUIRED' && !exGeprueft)}
        {row('Elektro / VDE', cabinet.elektrischAusgestattet ? 'Elektrisch ausgestattet' : 'Nicht elektrisch ausgestattet', <StatusPill done={elektroGeprueft} label="Elektro/VDE" />, cabinet.elektrischAusgestattet && !elektroGeprueft)}
        {row('Potentialausgleich', cabinet.potentialausgleich ? 'Bei Bestand vorhanden' : 'Bei Bestand nicht vorhanden', <StatusPill done={potentialausgleichGeprueft} label="Potentialausgleich" />, !potentialausgleichGeprueft)}
        {row('Kennzeichnung', 'Erforderlich', <StatusPill done={kennzeichnungGeprueft} label="Kennzeichnung" />, !kennzeichnungGeprueft)}
      </tbody>
    </table>
    <p className="px-4 py-3 text-xs text-muted-foreground">Reine Gegenüberstellung. Keine automatische fachliche Bewertung („konform“/„bestanden“) — das Prüfergebnis ergibt sich ausschließlich aus der entschiedenen Freigabe.</p>
  </div>
}

const GGA_EX_LABEL: Record<'NOT_ASSESSED' | 'REQUIRED' | 'NOT_REQUIRED', string> = {
  NOT_ASSESSED: 'Noch nicht bewertet',
  REQUIRED: 'Erforderlich',
  NOT_REQUIRED: 'Nicht erforderlich',
}
