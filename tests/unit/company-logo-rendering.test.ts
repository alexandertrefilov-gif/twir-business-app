import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { prepareCompanyLogoForRendering } from '@/lib/services/company-logo-rendering.service'

describe('Firmenlogo-Rendition für PDFs', () => {
  it('entfernt äußere Leerflächen, ohne die Quelldatei zu verändern', async () => {
    const source = await sharp({
      create: {
        width: 200,
        height: 120,
        channels: 4,
        background: '#ffffff',
      },
    })
      .composite([{
        input: await sharp({
          create: {
            width: 100,
            height: 40,
            channels: 4,
            background: '#000000',
          },
        }).png().toBuffer(),
        left: 50,
        top: 40,
      }])
      .png()
      .toBuffer()
    const original = Buffer.from(source)

    const result = await prepareCompanyLogoForRendering(
      source,
      'image/png',
      { width: 200, height: 120 },
    )

    expect(result).toMatchObject({
      width: 100,
      height: 40,
      mimeType: 'image/png',
      trimmed: true,
    })
    expect(source).toEqual(original)
  })

  it('lässt ein bereits randloses Logo unverändert dimensioniert', async () => {
    const source = await sharp({
      create: {
        width: 100,
        height: 40,
        channels: 4,
        background: '#000000',
      },
    }).png().toBuffer()

    const result = await prepareCompanyLogoForRendering(
      source,
      'image/png',
      { width: 100, height: 40 },
    )

    expect(result).toMatchObject({ width: 100, height: 40, trimmed: false })
  })
})
