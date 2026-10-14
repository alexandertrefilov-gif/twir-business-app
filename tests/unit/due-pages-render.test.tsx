// REQ-029 P5-6 B-2 / C2c + C2e: echte Server-Component-Renders (Projektseite, Schrankakte) gegen gefälschte Systemzeit.
// Ersetzt für diese beiden Stellen den reinen Quelltext-Wächter durch tatsächlich gerenderte Ausgabe.
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.stubGlobal('React', React)

const svc = vi.hoisted(() => ({
  project: vi.fn(), activity: vi.fn(), tower: vi.fn(),
  cabinet: vi.fn(), audit: vi.fn(), pruef: vi.fn(), delBlockers: vi.fn(), memberships: vi.fn(),
}))
vi.mock('next/navigation', () => ({ notFound: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/auth/collaboration-guards', () => ({ handleCollaborationPageError: (e: unknown) => { throw e } }))
vi.mock('@/lib/services/collaboration-phase2.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/collaboration-phase2.service')>()
  return { ...actual, getCollaborationPhase2Project: svc.project, getRecentCollaborationActivity: svc.activity, getVisibleCollaborationMemberships: svc.memberships }
})
vi.mock('@/lib/services/gga-cabinet.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/gga-cabinet.service')>()
  return {
    ...actual,
    getGgaControlTowerOverview: svc.tower, getGgaCabinetDetail: svc.cabinet, getGgaCabinetAuditHistory: svc.audit,
    getGgaCabinetPruefnachweisOverview: svc.pruef, getGgaCabinetDeleteBlockersFor: svc.delBlockers,
  }
})

import ProjectPage from '@/app/(collaboration)/collaboration/projects/[id]/page'
import CabinetPage from '@/app/(collaboration)/collaboration/cabinets/[id]/page'
import { deriveCabinetStatus } from '@/lib/collaboration/cabinet-workflow'

const D = (iso: string) => new Date(iso)
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }) })
afterEach(() => { vi.useRealTimers() })

function projectFixture(plannedEnd: Date | null) {
  const stage = {
    id: 's1', code: 'PLANUNG', title: 'Planung', sequence: 1, status: 'IN_PROGRESS', derivedStatus: 'IN_PROGRESS', weight: 100, isRequired: true,
    plannedEnd, blockedReason: null, dependencies: [], tasks: [], checklistItems: [], blockers: [], approvals: [], documents: [], requiresApproval: false,
  }
  return { id: 'p1', name: 'Projekt', projectNumber: 'P-1', status: 'ACTIVE', role: 'COLLAB_MANAGER', location: null, building: null, floor: null, area: null,
    plannedStart: null, plannedEnd: null, stages: [stage], blockers: [], memberships: [], members: [], healthStatus: 'GREEN', progressPercent: 0, nextAction: 'x', commercialReference: null }
}
async function renderProject(plannedEnd: Date | null) {
  svc.project.mockResolvedValue(projectFixture(plannedEnd))
  svc.activity.mockResolvedValue([])
  svc.tower.mockResolvedValue({ alleSchraenke: [], dringendeSchraenke: [] })
  const el = await ProjectPage({ params: Promise.resolve({ id: 'p1' }), searchParams: Promise.resolve({}) })
  return renderToStaticMarkup(el as React.ReactElement)
}
const textOf = (html: string) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|')

describe('Projektseite – „Verbleibende Zeit“ gerendert (C2e, E-4)', () => {
  const nowIso = '2026-10-20T10:00:00Z'
  const cases: Array<[string, string, string]> = [
    ['morgen', '2026-10-21T00:00:00Z', 'noch 1 Tag'],
    ['heute', '2026-10-20T00:00:00Z', 'Heute fällig'],
    ['gestern', '2026-10-19T00:00:00Z', '1 Tag überfällig'],
    ['vorgestern', '2026-10-18T00:00:00Z', '2 Tage überfällig'],
    ['in 5 Tagen', '2026-10-25T00:00:00Z', 'noch 5 Tage'],
  ]
  for (const [label, end, expected] of cases) {
    it(`plannedEnd ${label}: „${expected}“`, async () => {
      vi.setSystemTime(D(nowIso))
      const t = textOf(await renderProject(D(end)))
      expect(t).toContain('Verbleibende Zeit')
      expect(t).toContain(`|${expected}|`)
    })
  }
  it('Berliner Tageswechsel: 23:59:59 Berlin noch „Heute fällig“, 00:00:00 Berlin „1 Tag überfällig“', async () => {
    vi.setSystemTime(D('2026-10-20T21:59:59Z'))
    expect(textOf(await renderProject(D('2026-10-20T00:00:00Z')))).toContain('|Heute fällig|')
    vi.setSystemTime(D('2026-10-20T22:00:00Z'))
    expect(textOf(await renderProject(D('2026-10-20T00:00:00Z')))).toContain('|1 Tag überfällig|')
  })
  it('ohne plannedEnd keine „Verbleibende Zeit“', async () => {
    vi.setSystemTime(D(nowIso))
    expect(textOf(await renderProject(null))).not.toContain('Verbleibende Zeit')
  })
})

function cabinetFixture(tasks: Array<Record<string, unknown>>) {
  const tasksFull = tasks.map((t, i) => ({
    id: `t${i}`, title: `Maßnahme ${i}`, status: 'TODO', priority: 'MEDIUM', isRequired: true, dueDate: null, stageCode: 'UMSETZUNG',
    stage: { title: 'Umsetzung', code: 'UMSETZUNG' }, responsibleMembership: null, responsibleMembershipId: null, ...t,
  }))
  const snapshot = { bestandsaufnahmeAm: D('2026-01-01T00:00:00Z'), pruefintervallMonate: null, letztePruefungAm: null, tasks: tasksFull, checklistItems: [], blockers: [], approvals: [] }
  return {
    id: 'c1', kennung: 'K-001', bezeichnung: 'Schrank', role: 'COLLAB_MANAGER', projectId: 'p1', project: { projectNumber: 'P-1', name: 'Projekt', stages: [] },
    gebaeude: null, ebene: null, raumbezeichnung: null, tasks: tasksFull, checklistItems: [], blockers: [], approvals: [], documents: [],
    status: deriveCabinetStatus(snapshot as never, new Date()), responsibleMembership: null, responsibleMembershipId: null, service: null,
    exAssessmentStatus: 'OFFEN', exZoneKlassifikation: null, bestandsBeschreibung: null, lagerklasse: null, nutzungsart: null, herstellerName: null, herstellerTyp: null,
    elektrischAusgestattet: null, spannungVolt: null, potentialausgleich: null, abluftVorhanden: null, abluftUeberwachung: null,
    abluftVolumenstromSollM: null, abluftVolumenstromIstM: null, abluftAnschlussdurchmesserSollMm: null, pruefpflichtNorm: null, pruefintervallMonate: null, letztePruefungAm: null,
  }
}
async function renderCabinet(tasks: Array<Record<string, unknown>>) {
  svc.cabinet.mockResolvedValue(cabinetFixture(tasks))
  svc.memberships.mockResolvedValue([]); svc.audit.mockResolvedValue([]); svc.pruef.mockResolvedValue([]); svc.delBlockers.mockResolvedValue([])
  const el = await CabinetPage({ params: Promise.resolve({ id: 'c1' }) })
  return renderToStaticMarkup(el as React.ReactElement)
}
/** Zeilenklassen der Maßnahmentabelle: je Titel, ob die Zeile rot (bg-red-50) markiert ist. */
function rowRed(html: string, title: string): boolean {
  const m = html.match(new RegExp(`<tr(?: class="([^"]*)")?><td class="px-4 py-2">${title}</td>`))
  if (!m) throw new Error(`Zeile ${title} nicht gefunden`)
  return (m[1] ?? '').includes('bg-red-50')
}

describe('Schrankakte – Maßnahmenzeile gerendert (C2c, D-3)', () => {
  const due = D('2026-10-20T00:00:00Z')
  it('Fälligkeitstag: Zeile nicht rot; Berliner Folgetag: rot', async () => {
    for (const now of ['2026-10-19T22:00:00Z', '2026-10-20T09:00:00Z', '2026-10-20T21:59:59Z']) {
      vi.setSystemTime(D(now))
      expect(rowRed(await renderCabinet([{ title: 'Heute', dueDate: due }]), 'Heute'), now).toBe(false)
    }
    for (const now of ['2026-10-20T22:00:00Z', '2026-10-21T09:00:00Z']) {
      vi.setSystemTime(D(now))
      expect(rowRed(await renderCabinet([{ title: 'Spaet', dueDate: due }]), 'Spaet'), now).toBe(true)
    }
  })
  it('erledigte Maßnahme nie rot, Maßnahme ohne Frist nie rot', async () => {
    vi.setSystemTime(D('2026-12-01T10:00:00Z'))
    const html = await renderCabinet([{ title: 'Fertig', dueDate: due, status: 'DONE' }, { title: 'OhneFrist', dueDate: null }])
    expect(rowRed(html, 'Fertig')).toBe(false)
    expect(rowRed(html, 'OhneFrist')).toBe(false)
  })
  it('Altwert mit Uhrzeit (E-5)', async () => {
    const legacy = D('2026-10-20T17:42:31Z')
    vi.setSystemTime(D('2026-10-20T21:59:59Z'))
    expect(rowRed(await renderCabinet([{ title: 'Alt', dueDate: legacy }]), 'Alt')).toBe(false)
    vi.setSystemTime(D('2026-10-20T22:00:00Z'))
    expect(rowRed(await renderCabinet([{ title: 'Alt', dueDate: legacy }]), 'Alt')).toBe(true)
  })
})
