import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('createProjectAction — Regression für redirect() innerhalb try/catch', () => {
  it('ruft redirect() erst nach dem try/catch auf, damit NEXT_REDIRECT nicht als Fehler abgefangen wird', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/(dashboard)/projects/actions.ts'), 'utf8')
    const fn = source.slice(source.indexOf('export async function createProjectAction'), source.indexOf('export async function updateProjectAction'))
    expect(fn).toMatch(/let id: string/)
    // redirect(...) darf erst NACH dem catch-Rückgabestatement stehen, sonst
    // fängt der try/catch-Block den NEXT_REDIRECT-Wurf als normalen Fehler ab.
    const catchReturnIndex = fn.lastIndexOf("return { error:")
    const redirectIndex = fn.indexOf('redirect(`/projects/')
    expect(catchReturnIndex).toBeGreaterThan(-1)
    expect(redirectIndex).toBeGreaterThan(-1)
    expect(redirectIndex).toBeGreaterThan(catchReturnIndex)
  })
})
