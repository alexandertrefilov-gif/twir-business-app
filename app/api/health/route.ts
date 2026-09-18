// app/api/health/route.ts
// Healthcheck für Reverse-Proxy/Docker/Prozess-Supervisor.
// Bewusst ohne Auth — darf keine internen Daten preisgeben, nur Erreichbarkeit.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch {
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }
}
