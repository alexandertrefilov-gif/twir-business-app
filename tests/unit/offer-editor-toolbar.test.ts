import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import {
  FontFamily,
  FontSize,
  TextStyle,
} from '@tiptap/extension-text-style'
import {
  formatBrushTextStyle,
  parseAbsoluteTableWidth,
  selectedFontFamily,
  selectedFontSize,
  selectedHeadingLevel,
} from '@/components/offers/RichTextSectionsEditor'

describe('Angebotseditor-Werkzeugleiste', () => {
  it('liest Word-Breiten in pt und px, aber keine Prozentbreiten als Absolutwert', () => {
    expect(parseAbsoluteTableWidth('90pt')).toEqual([120])
    expect(parseAbsoluteTableWidth('180px')).toEqual([180])
    expect(parseAbsoluteTableWidth('25%')).toBeNull()
    expect(parseAbsoluteTableWidth('2px')).toEqual([2])
  })

  it('zeigt die Schriftart der aktuellen Textmarkierung', () => {
    expect(selectedFontFamily({ fontFamily: 'Times New Roman' })).toBe('Times New Roman')
    expect(selectedFontFamily({ fontFamily: 'Courier New' })).toBe('Courier New')
  })

  it('verwendet für normalen unformatierten Text die sichtbare Standardschrift', () => {
    expect(selectedFontFamily({})).toBe('Arial')
    expect(selectedFontFamily({ fontFamily: 'Unbekannte Schrift' })).toBe('Arial')
  })

  it('zeigt markierte Schriftgrößen und die Größen von Überschriften', () => {
    const paragraph = { isActive: () => false }
    const heading2 = {
      isActive: (_name: string, attrs?: Record<string, unknown>) => attrs?.level === 2,
    }

    expect(selectedFontSize(paragraph, { fontSize: '11pt' })).toBe('11pt')
    expect(selectedFontSize(paragraph, { fontSize: '16px' })).toBe('12pt')
    expect(selectedFontSize(heading2, {})).toBe('12pt')
    expect(selectedFontSize(paragraph, {})).toBe('11pt')
  })

  it('übernimmt mit dem Formatpinsel nur unterstützte Textattribute', () => {
    expect(formatBrushTextStyle({
      fontFamily: 'Georgia',
      fontSize: '18pt',
      color: '#1d4ed8',
      backgroundColor: '#dbeafe',
      msoStyle: 'unerlaubt',
      empty: null,
    })).toEqual({
      fontFamily: 'Georgia',
      fontSize: '18pt',
      color: '#1d4ed8',
      backgroundColor: '#dbeafe',
    })
  })

  it('erkennt Überschriften als kopierbares Blockformat', () => {
    const heading = {
      isActive: (_name: string, attrs?: Record<string, unknown>) => attrs?.level === 2,
    }
    const paragraph = { isActive: () => false }

    expect(selectedHeadingLevel(heading)).toBe(2)
    expect(selectedHeadingLevel(paragraph)).toBeNull()
  })

  it('schreibt Fett und Punktgröße auf den vollständig markierten Text', () => {
    const editor = new Editor({
      extensions: [StarterKit, TextStyle, FontFamily, FontSize],
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'Markierter Text' }],
        }],
      },
    })
    editor.commands.setTextSelection({ from: 1, to: 16 })

    expect(editor.chain().setBold().setFontSize('18pt').run()).toBe(true)
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'bold' }),
        expect.objectContaining({
          type: 'textStyle',
          attrs: expect.objectContaining({ fontSize: '18pt' }),
        }),
      ]),
    )
    editor.destroy()
  })

  it('vereinheitlicht eine gemischte Auswahl beim Aktivieren von Fett', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: {
        type: 'doc',
        content: [{
          type: 'paragraph',
          content: [
            { type: 'text', marks: [{ type: 'bold' }], text: 'Bereits fett' },
            { type: 'text', text: ' und normal' },
          ],
        }],
      },
    })
    editor.commands.setTextSelection({ from: 1, to: 24 })

    expect(editor.isActive('bold')).toBe(false)
    expect(editor.chain().toggleBold().run()).toBe(true)
    expect(editor.getJSON().content?.[0]?.content).toEqual([
      expect.objectContaining({
        text: 'Bereits fett und normal',
        marks: [expect.objectContaining({ type: 'bold' })],
      }),
    ])
    editor.destroy()
  })
})
