import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'

vi.stubGlobal('React', React)

const mocks = vi.hoisted(() => ({
  requirePagePermission: vi.fn(),
  getOfferById: vi.fn(),
  findCustomers: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()
  return { ...actual, requirePagePermission: mocks.requirePagePermission }
})

vi.mock('@/lib/services/offer.service', () => ({
  getOfferById: mocks.getOfferById,
}))

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    customer: {
      findMany: mocks.findCustomers,
    },
  },
}))

vi.mock('@/app/(dashboard)/offers/actions', () => ({
  createOfferAction: vi.fn(),
}))

vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: () => null,
}))

vi.mock('@/components/offers/OfferForm', () => ({
  OfferForm: () => null,
}))

import { Action, Resource } from '@/lib/auth/permissions'
import NewOfferPage from '@/app/(dashboard)/offers/new/page'

interface CopyDefaults {
  customerId?: string
  areaName?: string
  title?: string
  introText?: string
  outroText?: string
  offerDate?: string
  validUntil?: string
  items?: Array<{
    _key: string
    description: string
    quantity: string
    unit: string
    unitPrice: string
    taxRate: string
    notes: string
  }>
}

type ElementWithChildren = React.ReactElement<{ children?: React.ReactNode }>
type FormElement = React.ReactElement<{ defaults: CopyDefaults }>

function getFormDefaults(page: ElementWithChildren) {
  function findForm(node: React.ReactNode): FormElement | undefined {
    for (const child of React.Children.toArray(node)) {
      if (!React.isValidElement(child)) continue
      const element = child as ElementWithChildren
      if (typeof element.type === 'function' && element.type.name === 'OfferForm') {
        return element as FormElement
      }
      const nested = findForm(element.props.children)
      if (nested) return nested
    }
  }

  const form = findForm(page)
  if (!form) throw new Error('OfferForm nicht gefunden')
  return form.props.defaults
}

describe('Angebot kopieren', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requirePagePermission.mockResolvedValue({
      userId: 'user-1',
      userEmail: 'user@example.test',
      role: 'OFFICE',
    })
    mocks.findCustomers.mockResolvedValue([])
  })

  it('lädt ohne Kopierquelle kein bestehendes Angebot', async () => {
    const page = await NewOfferPage({ searchParams: Promise.resolve({}) })

    expect(mocks.requirePagePermission).toHaveBeenCalledWith(Resource.OFFER, Action.CREATE)
    expect(mocks.getOfferById).not.toHaveBeenCalled()
    expect(getFormDefaults(page).items).toBeUndefined()
  })

  it('prüft CREATE und READ vor dem Laden der Kopierquelle', async () => {
    mocks.getOfferById.mockResolvedValue({
      id: 'offer-1',
      offerNumber: 'AN-2026-0001',
      customerId: 'customer-1',
      areaName: 'Technischer Gebäudebetrieb',
      title: 'Wartungsangebot',
      introText: 'Einleitung',
      outroText: 'Abschluss',
      offerDate: new Date('2026-07-01T00:00:00.000Z'),
      validUntil: new Date('2026-07-31T00:00:00.000Z'),
      items: [
        {
          id: 'item-1',
          description: 'Wartung',
          quantity: { toNumber: () => 2 },
          unit: 'Std.',
          unitPrice: { toNumber: () => 95 },
          taxRate: { toNumber: () => 19 },
          notes: 'Vor Ort',
        },
      ],
    })

    const page = await NewOfferPage({
      searchParams: Promise.resolve({ copy: 'offer-1' }),
    })

    expect(mocks.requirePagePermission).toHaveBeenNthCalledWith(
      1,
      Resource.OFFER,
      Action.CREATE,
    )
    expect(mocks.requirePagePermission).toHaveBeenNthCalledWith(
      2,
      Resource.OFFER,
      Action.READ,
    )
    expect(mocks.requirePagePermission.mock.invocationCallOrder[1])
      .toBeLessThan(mocks.getOfferById.mock.invocationCallOrder[0])

    expect(getFormDefaults(page)).toEqual({
      customerId: 'customer-1',
      areaName: 'Technischer Gebäudebetrieb',
      title: 'Wartungsangebot',
      introText: 'Einleitung',
      outroText: 'Abschluss',
      offerDate: '2026-07-01',
      validUntil: '2026-07-31',
      items: [
        {
          _key: 'copy-item-1',
          description: 'Wartung',
          quantity: '2',
          unit: 'Std.',
          unitPrice: '95',
          taxRate: '19',
          notes: 'Vor Ort',
        },
      ],
    })
  })

  it('fragt ohne erfolgreiche READ-Prüfung keine Angebotsdaten ab', async () => {
    mocks.requirePagePermission
      .mockResolvedValueOnce({
        userId: 'user-1',
        userEmail: 'user@example.test',
        role: 'OFFICE',
      })
      .mockRejectedValueOnce(new Error('Nicht erlaubt'))

    await expect(NewOfferPage({
      searchParams: Promise.resolve({ copy: 'offer-1' }),
    })).rejects.toThrow('Nicht erlaubt')

    expect(mocks.getOfferById).not.toHaveBeenCalled()
    expect(mocks.findCustomers).not.toHaveBeenCalled()
  })
})
