import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow } from '@tiptap/extension-table'
import { TextAlign } from '@tiptap/extension-text-align'
import {
  BackgroundColor,
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from '@tiptap/extension-text-style'
import {
  formatBrushTextStyle,
  parseAbsoluteTableWidth,
  readToolbarState,
  selectedFontFamily,
  selectedFontSize,
  selectedHeadingLevel,
  StyledTableCell,
  StyledTableHeader,
} from '@/components/offers/RichTextSectionsEditor'

function createToolbarEditor(content: JSONContent) {
  return new Editor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      StyledTableHeader,
      StyledTableCell,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      BackgroundColor,
      FontFamily,
      FontSize,
    ],
    content,
  })
}

describe('Angebotseditor-Werkzeugleiste', () => {
  it('macht jede Toolbar ab Tablet mit breakpoint-gerechtem Header-Abstand sticky', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')
    const toolbarStart = source.indexOf('data-rich-text-toolbar')
    const toolbarClasses = source.slice(source.lastIndexOf('className=', toolbarStart), toolbarStart)

    expect(toolbarStart).toBeGreaterThan(0)
    expect(toolbarClasses).toContain('md:sticky')
    expect(toolbarClasses).toContain('z-20')
    expect(toolbarClasses).toContain('bg-white')
    expect(toolbarClasses).toContain('flex-wrap')
    expect(source).toContain("querySelector<HTMLElement>('[data-business-document-header]')")
    expect(source).toContain("matchMedia('(min-width: 1024px)')")
    expect(source).toContain('new ResizeObserver(updateOffset)')
    expect(source).toContain("desktopHeader.addEventListener('change', updateOffset)")
    expect(source).toContain('style={{ top: stickyTop }}')
    expect(source).toContain('data-sticky-active="true"')
    expect(source).toContain("'form-section min-w-0 p-0'")
    expect(source).toContain("'rounded-lg border border-stone-200 bg-white'")
    expect(source).not.toContain("'overflow-hidden rounded-lg border border-stone-200 bg-white'")
    expect(source).not.toContain("'form-section min-w-0 overflow-clip p-0'")
    expect(source).not.toContain("'form-section min-w-0 overflow-hidden p-0'")
    expect(source).not.toContain('position: fixed')
  })

  it('gibt jeder bestehenden und dynamisch ergänzten Textkarte denselben Sticky-Container', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')

    expect(source).toContain('document.sections.map((section, index) => (')
    expect(source).toContain('<RichTextArea')
    expect(source).toContain('key={section.id}')
    expect(source).toContain("sections: [...current.sections, {")
    expect(source).not.toContain('stickyActive')
    expect(source).not.toContain('TOOLBAR_ACTIVATE_EVENT')
    expect(source).not.toContain('index === 0')
  })

  it('hält die vollständige Text- und Tabellenwerkzeugleiste in derselben Sticky-Hülle', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')
    const toolbarStart = source.indexOf('data-rich-text-toolbar')
    const toolbarEnd = source.indexOf('{clipboardMessage &&', toolbarStart)
    const toolbar = source.slice(toolbarStart, toolbarEnd)

    for (const control of [
      'Rückgängig', 'Fett', 'Schriftart', 'Schriftgröße', 'Tabelle einfügen',
      'Zeile hinzufügen', 'Zeile löschen', 'Spalte hinzufügen', 'Spalte löschen',
      'Markierte Zellen verbinden', 'Verbundene Zelle trennen', 'Kopfzeile',
      'Tabelle vollständig löschen',
    ]) {
      expect(toolbar).toContain(control)
    }
    expect(toolbar).not.toContain('Zeilenhöhe vergrößern')
    expect(toolbar).not.toContain('Zeilenhöhe verkleinern')
    expect(source).not.toContain('changeRowHeight')
  })

  it('behält Spalten-Resize und ignoriert alte feste Zeilenhöhen im Editor-DOM', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    const wordPaste = readFileSync(resolve(process.cwd(), 'lib/offers/word-paste.ts'), 'utf8')
    const editor = createToolbarEditor({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            attrs: { colspan: 1, rowspan: 1, colwidth: [180], rowHeight: 96 },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Automatische Höhe' }] }],
          }, {
            type: 'tableCell',
            attrs: { colspan: 1, rowspan: 1, colwidth: [120] },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zweite Spalte' }] }],
          }],
        }],
      }],
    })

    expect(source).toContain('Table.configure({ resizable: true, View: ResponsiveTableView })')
    expect(source).toContain('parseHTML: () => null')
    expect(source).toContain('renderHTML: () => ({})')
    expect(JSON.stringify(editor.getJSON())).toContain('"rowHeight":96')
    expect(source).not.toContain("'data-row-height': String(rowHeight)")
    expect(source).not.toContain('style: `height: ${rowHeight}px;`')
    expect(css).toContain('height: auto;')
    expect(wordPaste).not.toContain("name === 'height'")
    expect(wordPaste).not.toContain('styles.push(`height: ${height}`)')
    editor.destroy()
  })

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

  it('hält Befehlszustand und Dokumentformatierung beim Umschalten synchron', () => {
    const editor = createToolbarEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Formatierter Text' }] }],
    })
    editor.commands.setTextSelection({ from: 1, to: 18 })

    expect(editor.chain().toggleBold().toggleItalic().toggleUnderline().toggleStrike().run()).toBe(true)
    expect(readToolbarState(editor)).toMatchObject({
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      selectionEmpty: false,
    })

    expect(editor.chain().toggleBold().toggleItalic().toggleUnderline().toggleStrike().run()).toBe(true)
    expect(readToolbarState(editor)).toMatchObject({
      bold: false,
      italic: false,
      underline: false,
      strike: false,
    })
    editor.destroy()
  })

  it('behandelt Überschrift und Fett als getrennte, reproduzierbare Formate', () => {
    const editor = createToolbarEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Überschrift' }] }],
    })
    editor.commands.setTextSelection({ from: 1, to: 12 })

    expect(editor.chain().toggleHeading({ level: 2 }).run()).toBe(true)
    expect(readToolbarState(editor)).toMatchObject({ heading2: true, bold: false })
    expect(editor.chain().toggleBold().run()).toBe(true)
    expect(readToolbarState(editor)).toMatchObject({ heading2: true, bold: true })
    expect(editor.chain().toggleHeading({ level: 2 }).run()).toBe(true)
    expect(readToolbarState(editor)).toMatchObject({ heading2: false, bold: true })
    editor.destroy()
  })

  it('aktualisiert Listen, Ausrichtung und Schrift aus demselben Editorzustand', () => {
    const editor = createToolbarEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zustand' }] }],
    })
    editor.commands.setTextSelection({ from: 1, to: 8 })

    expect(editor.chain()
      .toggleBulletList()
      .setTextAlign('center')
      .setFontFamily('Georgia')
      .setFontSize('18pt')
      .setColor('#1d4ed8')
      .run()).toBe(true)
    expect(readToolbarState(editor)).toMatchObject({
      bulletList: true,
      orderedList: false,
      textAlign: 'center',
      fontFamily: 'Georgia',
      fontSize: '18pt',
      textColor: '#1d4ed8',
    })
    editor.destroy()
  })

  it('leitet Undo- und Redo-Verfügbarkeit aus dem reaktiven Toolbarzustand ab', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/offers/RichTextSectionsEditor.tsx'), 'utf8')

    expect(source).toContain('canUndo: editor.can().undo()')
    expect(source).toContain('canRedo: editor.can().redo()')
    expect(source).toContain('disabled={!toolbarFormat?.canUndo}')
    expect(source).toContain('disabled={!toolbarFormat?.canRedo}')
  })

  it('setzt Zeichenformatierung und Ausrichtung zurück, ohne die Überschrift zu zerstören', () => {
    const editor = createToolbarEditor({
      type: 'doc',
      content: [{
        type: 'heading',
        attrs: { level: 2, textAlign: 'right' },
        content: [{
          type: 'text',
          marks: [
            { type: 'bold' },
            { type: 'textStyle', attrs: { fontFamily: 'Georgia', fontSize: '18pt', color: '#1d4ed8' } },
          ],
          text: 'Struktur bleibt',
        }],
      }],
    })
    editor.commands.setTextSelection({ from: 1, to: 15 })

    expect(editor.chain().unsetAllMarks().setTextAlign('left').run()).toBe(true)
    expect(readToolbarState(editor)).toMatchObject({
      heading2: true,
      bold: false,
      textAlign: 'left',
      fontFamily: 'Arial',
      fontSize: '12pt',
    })
    expect(editor.getJSON().content?.[0]?.type).toBe('heading')
    editor.destroy()
  })

  it('führt Zustände mehrerer Editorinstanzen unabhängig', () => {
    const first = createToolbarEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Erster Editor' }] }],
    })
    const second = createToolbarEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zweiter Editor' }] }],
    })
    first.commands.setTextSelection({ from: 1, to: 14 })
    second.commands.setTextSelection({ from: 1, to: 15 })

    expect(first.commands.setBold()).toBe(true)
    expect(readToolbarState(first).bold).toBe(true)
    expect(readToolbarState(second).bold).toBe(false)
    first.destroy()
    second.destroy()
  })

  it('aktualisiert den Toolbarzustand beim Cursorwechsel zwischen formatiertem und normalem Text', () => {
    const editor = createToolbarEditor({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', marks: [{ type: 'bold' }, { type: 'italic' }], text: 'Fettkursiv' },
          { type: 'text', text: ' normal' },
        ],
      }],
    })

    editor.commands.setTextSelection(3)
    expect(readToolbarState(editor)).toMatchObject({ bold: true, italic: true })
    editor.commands.setTextSelection(14)
    expect(readToolbarState(editor)).toMatchObject({ bold: false, italic: false })
    editor.destroy()
  })

  it('wendet Textformatierung auch in Tabellenzellen an und meldet den Tabellenkontext', () => {
    const editor = createToolbarEditor({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'tableRow',
          content: [{
            type: 'tableCell',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Zelleninhalt' }] }],
          }],
        }],
      }],
    })
    editor.commands.setTextSelection({ from: 3, to: 15 })

    expect(editor.chain()
      .toggleBold()
      .toggleItalic()
      .setFontSize('18pt')
      .setColor('#b91c1c')
      .setTextAlign('right')
      .setCellAttribute('backgroundColor', '#dbeafe')
      .run()).toBe(true)
    expect(readToolbarState(editor)).toMatchObject({
      table: true,
      bold: true,
      italic: true,
      fontSize: '18pt',
      textColor: '#b91c1c',
      textAlign: 'right',
      cellBackground: '#dbeafe',
    })
    editor.destroy()
  })

  it('übernimmt ein aus Word normalisiertes Fett-Mark in den Toolbarzustand', () => {
    const editor = createToolbarEditor({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'bold' }], text: 'Word-Fett' }],
      }],
    })
    editor.commands.setTextSelection({ from: 1, to: 10 })

    expect(readToolbarState(editor).bold).toBe(true)
    editor.destroy()
  })
})
