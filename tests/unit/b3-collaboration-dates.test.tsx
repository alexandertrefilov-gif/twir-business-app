// REQ-029 P5-6 B-3 / D1+D2: Collaboration-Komponenten – Kalendertage (Aufgaben-Fälligkeit) vs. echte Zeitpunkte (Freigabe, Blocker).
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.stubGlobal('React', React)
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

import { GgaCabinetFreigabehistorie } from '@/components/collaboration/GgaCabinetFreigabehistorie'
import { GgaCabinetBlockerList } from '@/components/collaboration/GgaCabinetBlockerList'
import { CollaborationStageActions } from '@/components/collaboration/CollaborationStageActions'

const ZONES = ['UTC', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo', 'Pacific/Auckland'] as const
const originalTz = process.env.TZ
afterEach(() => { if (originalTz === undefined) delete process.env.TZ; else process.env.TZ = originalTz })
const text = (html: string) => html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|')

describe.each(ZONES)('Collaboration-Datumsanzeige in Zone %s', (zone) => {
  it('Freigabehistorie: echte Zeitpunkte als Berliner Tag (Berlin 00:30 am 13.10.)', () => {
    process.env.TZ = zone
    const html = renderToStaticMarkup(<GgaCabinetFreigabehistorie approvals={[{
      id: 'a1', status: 'APPROVED', approvalType: 'INTERNAL', requestedAt: '2026-10-12T22:30:00.000Z', decidedAt: '2026-12-31T23:30:00.000Z',
      decisionNote: null, requestedByName: 'A', decidedByName: 'B',
    }]} />)
    expect(text(html)).toContain('13.10.2026')
    expect(text(html)).toContain('01.01.2027')
    expect(text(html)).not.toContain('12.10.2026')
  })

  it('Blockerliste: resolvedAt (Zeitpunkt) als Berliner Tag', () => {
    process.env.TZ = zone
    const html = renderToStaticMarkup(<GgaCabinetBlockerList canResolve={false} blockers={[{
      id: 'b1', title: 'B', status: 'RESOLVED', cause: null, resolution: 'ok', resolvedAt: '2026-10-12T22:30:00.000Z',
    }]} />)
    expect(text(html)).toContain('(13.10.2026)')
  })

  it.each([
    ['2026-10-13T00:00:00Z', '13.10.2026'], ['2026-12-31T00:00:00Z', '31.12.2026'], ['2027-01-01T00:00:00Z', '1.1.2027'],
    ['2026-10-20T17:42:00Z', '20.10.2026'], ['2028-02-29T00:00:00Z', '29.2.2028'],
  ])('Aufgaben-Fälligkeit (Kalendertag) %s → %s', (stored, shown) => {
    process.env.TZ = zone
    const html = renderToStaticMarkup(<CollaborationStageActions
      stage={{ id: 's1', status: 'OPEN', tasks: [{ id: 't1', title: 'Aufgabe', status: 'OPEN', dueDate: new Date(stored) }] } as never}
      projectId="p1" />)
    expect(text(html)).toContain(shown)
  })
})
