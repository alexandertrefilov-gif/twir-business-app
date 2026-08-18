import { describe, expect, it } from 'vitest'
import {
  normalizeWordColor,
  normalizeWordFontFamily,
  normalizeWordFontSize,
} from '@/lib/offers/word-paste'

describe('Word-Formatierung normalisieren', () => {
  it('ordnet typische Word-Schriften unterstützten Schriftarten zu', () => {
    expect(normalizeWordFontFamily('"Aptos", sans-serif')).toBe('Arial')
    expect(normalizeWordFontFamily('Calibri, sans-serif')).toBe('Arial')
    expect(normalizeWordFontFamily('"Times New Roman", serif')).toBe('Times New Roman')
    expect(normalizeWordFontFamily('Consolas')).toBe('Courier New')
  })

  it('wandelt Word-Punktgrößen in erlaubte Pixelgrößen um', () => {
    expect(normalizeWordFontSize('9pt')).toBe('10pt')
    expect(normalizeWordFontSize('11pt')).toBe('11pt')
    expect(normalizeWordFontSize('12pt')).toBe('12pt')
    expect(normalizeWordFontSize('16px')).toBe('12pt')
  })

  it('wandelt Word-RGB-Farben in sichere Hex-Farben um', () => {
    expect(normalizeWordColor('rgb(29, 78, 216)')).toBe('#1d4ed8')
    expect(normalizeWordColor('#abc')).toBe('#aabbcc')
    expect(normalizeWordColor('expression(alert(1))')).toBeNull()
  })
})
