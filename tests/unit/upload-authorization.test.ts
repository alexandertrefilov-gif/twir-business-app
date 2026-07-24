import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { RoleName } from '@/types/enums'

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth/options', () => ({
  authOptions: {},
}))

vi.mock('@/lib/services/document.service', () => ({
  generateStorageFilename: vi.fn().mockReturnValue('upload_test.txt'),
  registerDocument: vi.fn().mockResolvedValue('document-id'),
}))

import { POST } from '@/app/api/upload/route'

const mockedGetServerSession = vi.mocked(getServerSession)

function uploadRequest() {
  const formData = new FormData()
  formData.append('file', new File(['test'], 'test.txt', { type: 'text/plain' }))

  return new NextRequest('http://localhost/api/upload', {
    method: 'POST',
    body: formData,
  })
}

function sessionFor(role: RoleName) {
  return {
    user: {
      id: `${role.toLowerCase()}-id`,
      email: `${role.toLowerCase()}@example.com`,
      name: role,
      role,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  }
}

describe('Upload-Autorisierung', () => {
  beforeEach(() => {
    process.env.STORAGE_DRIVER = 's3'
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete process.env.STORAGE_DRIVER
  })

  it('erlaubt ADMIN den Upload', async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(RoleName.ADMIN))

    const response = await POST(uploadRequest())

    expect(response.status).toBe(201)
  })

  it('erlaubt einer berechtigten OFFICE-Rolle den Upload', async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(RoleName.OFFICE))

    const response = await POST(uploadRequest())

    expect(response.status).toBe(201)
  })

  it('verweigert EMPLOYEE ohne document:create den Upload', async () => {
    mockedGetServerSession.mockResolvedValue(sessionFor(RoleName.EMPLOYEE))

    const response = await POST(uploadRequest())

    expect(response.status).toBe(403)
  })

  it('verweigert nicht angemeldeten Benutzern den Upload', async () => {
    mockedGetServerSession.mockResolvedValue(null)

    const response = await POST(uploadRequest())

    expect(response.status).toBe(401)
  })
})
