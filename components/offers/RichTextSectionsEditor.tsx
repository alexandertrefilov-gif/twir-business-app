'use client'

import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { TextAlign } from '@tiptap/extension-text-align'
import {
  BackgroundColor,
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from '@tiptap/extension-text-style'
import { useMemo, useRef, useState } from 'react'
import {
  decodeOfferText,
  encodeOfferText,
  isOfferTextDocumentEmpty,
  type OfferTextDocument,
  type OfferTextSection,
  type RichTextNode,
} from '@/lib/offers/rich-text'
import { normalizeWordHtml } from '@/lib/offers/word-paste'

interface RichTextSectionsEditorProps {
  name: string
  label: string
  defaultValue?: string
  placeholder: string
}

const COLORS = ['#1c1917', '#1d4ed8', '#047857', '#b91c1c', '#7c3aed']
const TABLE_COLORS = [
  '#ffffff',
  '#f5f5f4',
  '#fef3c7',
  '#fed7aa',
  '#dbeafe',
  '#dcfce7',
  '#fee2e2',
  '#f3e8ff',
]
const FONT_FAMILIES = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New']
const FONT_SIZES = ['10pt', '11pt', '12pt', '14pt', '16pt', '18pt']

const tableCellBackground = {
  default: null,
  parseHTML: (element: HTMLElement) =>
    element.getAttribute('data-background-color') || element.style.backgroundColor || null,
  renderHTML: (attributes: Record<string, unknown>) => {
    const backgroundColor = attributes.backgroundColor
    return typeof backgroundColor === 'string'
      ? {
          'data-background-color': backgroundColor,
          style: `background-color: ${backgroundColor};${
            isDarkTableColor(backgroundColor) ? ' color: #ffffff;' : ''
          }`,
        }
      : {}
  },
}

export function parseAbsoluteTableWidth(rawWidth: string | null): number[] | null {
  if (!rawWidth || rawWidth.includes('%')) return null
  const value = Number.parseFloat(rawWidth)
  if (!Number.isFinite(value) || value <= 0) return null
  return [Math.round(rawWidth.toLowerCase().includes('pt') ? value * 4 / 3 : value)]
}

function parseTableWidth(element: HTMLElement): number[] | null {
  const stored = element.getAttribute('colwidth')
  if (stored) {
    const widths = stored.split(',').map(Number)
    if (widths.every((width) => Number.isFinite(width) && width > 0)) return widths
  }

  const row = element.parentElement
  const table = element.closest('table')
  const cellIndex = row ? Array.from(row.children).indexOf(element) : -1
  const colgroupWidth = table && cellIndex >= 0
    ? (() => {
        const column = table.querySelectorAll<HTMLElement>('colgroup > col')[cellIndex]
        return column?.getAttribute('width') || column?.style.width || null
      })()
    : null
  const rawWidth = element.getAttribute('width') ||
    element.style.width ||
    colgroupWidth
  return parseAbsoluteTableWidth(rawWidth)
}

const tableCellWidth = {
  default: null,
  parseHTML: parseTableWidth,
  renderHTML: (attributes: Record<string, unknown>) => {
    const widths = attributes.colwidth
    return Array.isArray(widths) && widths.every(Number.isFinite)
      ? {
          colwidth: widths.join(','),
          style: `width: ${widths[0]}px;`,
        }
      : {}
  },
}

const tableRowHeight = {
  default: null,
  parseHTML: (element: HTMLElement) => {
    const tableRow = element.closest('tr')
    const rawHeight = element.getAttribute('data-row-height') ||
      element.getAttribute('height') ||
      element.style.height ||
      tableRow?.getAttribute('height') ||
      tableRow?.style.height
    if (!rawHeight) return null
    const value = Number.parseFloat(rawHeight)
    if (!Number.isFinite(value) || value < 24 || value > 160) return null
    return Math.round(rawHeight.includes('pt') ? value * 4 / 3 : value)
  },
  renderHTML: (attributes: Record<string, unknown>) => {
    const rowHeight = attributes.rowHeight
    return typeof rowHeight === 'number'
      ? {
          'data-row-height': String(rowHeight),
          style: `height: ${rowHeight}px;`,
        }
      : {}
  },
}

function isDarkTableColor(color: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return false
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 < 128
}

const StyledTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colwidth: tableCellWidth,
      backgroundColor: tableCellBackground,
      rowHeight: tableRowHeight,
    }
  },
})

const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colwidth: tableCellWidth,
      backgroundColor: tableCellBackground,
      rowHeight: tableRowHeight,
    }
  },
})

export function RichTextSectionsEditor({
  name,
  label,
  defaultValue,
  placeholder,
}: RichTextSectionsEditorProps) {
  const [document, setDocument] = useState<OfferTextDocument>(
    () => decodeOfferText(defaultValue),
  )

  const serialized = useMemo(
    () => isOfferTextDocumentEmpty(document) ? '' : encodeOfferText(document),
    [document],
  )

  function addSection() {
    setDocument((current) => ({
      ...current,
      sections: [...current.sections, {
        id: crypto.randomUUID(),
        title: '',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
      }],
    }))
  }

  function updateSection(id: string, patch: Partial<OfferTextSection>) {
    setDocument((current) => ({
      ...current,
      sections: current.sections.map((section) =>
        section.id === id ? { ...section, ...patch } : section),
    }))
  }

  function removeSection(id: string) {
    setDocument((current) => ({
      ...current,
      sections: current.sections.length === 1
        ? current.sections
        : current.sections.filter((section) => section.id !== id),
    }))
  }

  return (
    <div>
      <input type="hidden" name={name} value={serialized} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="field-label">{label}</p>
          <p className="field-hint">Formatierung erscheint im fertigen Angebot, die Werkzeugleiste nur hier.</p>
        </div>
        <button
          type="button"
          onClick={addSection}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 text-xs font-500 text-blue-700 hover:bg-blue-100"
        >
          <span aria-hidden>＋</span> Textbereich
        </button>
      </div>

      <div className="space-y-4">
        {document.sections.map((section, index) => (
          <div key={section.id} className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <div className="flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2">
              <input
                type="text"
                value={section.title}
                maxLength={200}
                onChange={(event) => updateSection(section.id, { title: event.target.value })}
                placeholder={`Überschrift Bereich ${index + 1} (optional)`}
                className="h-8 flex-1 rounded border border-stone-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                disabled={document.sections.length === 1}
                onClick={() => removeSection(section.id)}
                aria-label={`Textbereich ${index + 1} entfernen`}
                className="h-8 rounded px-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                −
              </button>
            </div>
            <RichTextArea
              content={section.content}
              placeholder={placeholder}
              onChange={(content) => updateSection(section.id, { content })}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function RichTextArea({
  content,
  placeholder,
  onChange,
}: {
  content: RichTextNode
  placeholder: string
  onChange: (content: RichTextNode) => void
}) {
  const savedSelection = useRef<{ from: number; to: number } | null>(null)
  const preserveSelection = useRef(false)
  const [clipboardMessage, setClipboardMessage] = useState('')
  const [formatBrush, setFormatBrush] = useState<{
    bold: boolean
    italic: boolean
    underline: boolean
    strike: boolean
    headingLevel: 1 | 2 | 3 | null
    textAlign: 'left' | 'center' | 'right' | 'justify'
    textStyle: Record<string, unknown>
  } | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
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
    editorProps: {
      attributes: {
        class: 'offer-rich-editor min-h-36 px-4 py-3 focus:outline-none',
        'data-placeholder': placeholder,
      },
      transformPastedHTML: normalizeWordHtml,
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON() as RichTextNode)
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const { from, to } = currentEditor.state.selection
      if (from !== to) {
        savedSelection.current = { from, to }
      } else if (!preserveSelection.current) {
        savedSelection.current = null
      }
    },
    onBlur: ({ editor: currentEditor }) => {
      const { from, to } = currentEditor.state.selection
      if (from !== to) savedSelection.current = { from, to }
    },
  })
  const toolbarFormat = useEditorState({
    editor,
    selector: ({ editor: selectedEditor }) => {
      if (!selectedEditor) {
        return {
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          heading2: false,
          fontFamily: 'Arial',
          fontSize: '11pt',
        }
      }
      const textStyle = selectedEditor.getAttributes('textStyle') as Record<string, unknown>
      const headingLevel = selectedHeadingLevel(selectedEditor)
      return {
        bold: selectedEditor.isActive('bold'),
        italic: selectedEditor.isActive('italic'),
        underline: selectedEditor.isActive('underline'),
        strike: selectedEditor.isActive('strike'),
        heading2: headingLevel === 2,
        fontFamily: selectedFontFamily(textStyle),
        fontSize: selectedFontSize(selectedEditor, textStyle),
      }
    },
  })

  if (!editor) return <div className="h-36 animate-pulse bg-stone-50" />
  const currentEditor = editor

  function rememberSelection() {
    const { from, to } = currentEditor.state.selection
    if (from !== to) {
      savedSelection.current = { from, to }
      preserveSelection.current = true
    }
  }

  function restoreMarkedText() {
    if (savedSelection.current) {
      currentEditor.chain().setTextSelection(savedSelection.current).run()
    }
  }

  function formattingChain() {
    restoreMarkedText()
    return currentEditor.chain().focus()
  }

  function applyFontFamily(fontFamily: string) {
    formattingChain().setFontFamily(fontFamily).run()
    preserveSelection.current = false
  }

  function applyFontSize(fontSize: string) {
    formattingChain().setFontSize(fontSize).run()
    preserveSelection.current = false
  }

  function toggleHeading() {
    const isHeading = currentEditor.isActive('heading', { level: 2 })
    const chain = formattingChain().toggleHeading({ level: 2 })
    if (!isHeading) chain.setBold()
    chain.run()
  }

  function useFormatBrush() {
    restoreMarkedText()
    if (!formatBrush) {
      if (currentEditor.state.selection.empty) {
        setClipboardMessage('Zuerst den formatierten Quelltext markieren')
        return
      }
      setFormatBrush({
        bold: currentEditor.isActive('bold'),
        italic: currentEditor.isActive('italic'),
        underline: currentEditor.isActive('underline'),
        strike: currentEditor.isActive('strike'),
        headingLevel: selectedHeadingLevel(currentEditor),
        textAlign: selectedTextAlign(currentEditor),
        textStyle: currentEditor.getAttributes('textStyle') as Record<string, unknown>,
      })
      setClipboardMessage('Format aufgenommen – jetzt Zieltext markieren und „Anwenden“ wählen')
      return
    }

    if (currentEditor.state.selection.empty) {
      setClipboardMessage('Zieltext markieren, bevor die Formatierung angewendet wird')
      return
    }
    const chain = formattingChain()
    if (formatBrush.headingLevel) {
      chain.setHeading({ level: formatBrush.headingLevel })
    } else {
      chain.setParagraph()
    }
    chain
      .setTextAlign(formatBrush.textAlign)
      .unsetMark('bold')
      .unsetMark('italic')
      .unsetMark('underline')
      .unsetMark('strike')
      .unsetMark('textStyle')

    if (formatBrush.bold) chain.setMark('bold')
    if (formatBrush.italic) chain.setMark('italic')
    if (formatBrush.underline) chain.setMark('underline')
    if (formatBrush.strike) chain.setMark('strike')
    const textStyle = formatBrushTextStyle(formatBrush.textStyle)
    if (Object.keys(textStyle).length) chain.setMark('textStyle', textStyle)
    chain.run()
    setFormatBrush(null)
    setClipboardMessage('Formatierung auf den markierten Text angewendet')
  }

  function runClipboardCommand(command: 'cut' | 'copy') {
    currentEditor.chain().focus().run()
    const successful = globalThis.document.execCommand(command)
    setClipboardMessage(successful
      ? command === 'cut' ? 'Text ausgeschnitten' : 'Text kopiert'
      : 'Bitte Tastenkürzel verwenden')
  }

  function changeRowHeight(step: number) {
    const current = currentEditor.getAttributes('tableCell').rowHeight ??
      currentEditor.getAttributes('tableHeader').rowHeight
    const next = Math.min(160, Math.max(24, (typeof current === 'number' ? current : 32) + step))
    currentEditor.chain().focus().setCellAttribute('rowHeight', next).run()
  }

  async function pasteFromClipboard() {
    try {
      if (typeof navigator.clipboard.read === 'function') {
        const clipboardItems = await navigator.clipboard.read()
        for (const item of clipboardItems) {
          if (item.types.includes('text/html')) {
            const html = await (await item.getType('text/html')).text()
            currentEditor.chain().focus().insertContent(normalizeWordHtml(html)).run()
            setClipboardMessage('Word-Formatierung eingefügt')
            return
          }
        }
      }

      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setClipboardMessage('Zwischenablage ist leer')
        return
      }
      currentEditor.chain().focus().insertContent(text).run()
      setClipboardMessage('Text eingefügt')
    } catch {
      setClipboardMessage('Einfügen bitte mit Strg/Cmd + V')
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1 border-b border-stone-200 bg-white px-2 py-2">
        <Tool
          disabled={!editor.can().chain().focus().undo().run()}
          label="Rückgängig"
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </Tool>
        <Tool
          disabled={!editor.can().chain().focus().redo().run()}
          label="Wiederholen"
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </Tool>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <Tool
          disabled={editor.state.selection.empty}
          label="Markierten Text ausschneiden"
          onClick={() => runClipboardCommand('cut')}
        >
          ✂ Ausschneiden
        </Tool>
        <Tool
          disabled={editor.state.selection.empty}
          label="Markierten Text kopieren"
          onClick={() => runClipboardCommand('copy')}
        >
          Kopieren
        </Tool>
        <Tool label="Inhalt mit Word-Formatierung einfügen" onClick={() => void pasteFromClipboard()}>
          Einfügen
        </Tool>
        <Tool
          disabled={editor.state.selection.empty}
          label="Markierten Text löschen"
          onClick={() => editor.chain().focus().deleteSelection().run()}
        >
          Löschen
        </Tool>
        <Tool label="Gesamten Textbereich markieren" onClick={() => editor.chain().focus().selectAll().run()}>
          Alles markieren
        </Tool>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <Tool active={toolbarFormat?.bold} label="Fett" onClick={() => formattingChain().toggleBold().run()}>B</Tool>
        <Tool active={toolbarFormat?.italic} label="Kursiv" onClick={() => formattingChain().toggleItalic().run()}><em>I</em></Tool>
        <Tool active={toolbarFormat?.underline} label="Unterstrichen" onClick={() => formattingChain().toggleUnderline().run()}><u>U</u></Tool>
        <Tool active={toolbarFormat?.strike} label="Durchgestrichen" onClick={() => formattingChain().toggleStrike().run()}><s>S</s></Tool>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <Tool active={toolbarFormat?.heading2} label="Überschrift" onClick={toggleHeading}>H</Tool>
        <Tool active={editor.isActive('bulletList')} label="Aufzählung" onClick={() => formattingChain().toggleBulletList().run()}>• Liste</Tool>
        <Tool active={editor.isActive('orderedList')} label="Nummerierung" onClick={() => formattingChain().toggleOrderedList().run()}>1. Liste</Tool>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        {(['left', 'center', 'right'] as const).map((alignment) => (
          <Tool
            key={alignment}
            active={editor.isActive({ textAlign: alignment })}
            label={`Ausrichtung ${alignment}`}
            onClick={() => formattingChain().setTextAlign(alignment).run()}
          >
            {alignment === 'left' ? '≡' : alignment === 'center' ? '≣' : '☰'}
          </Tool>
        ))}
        <select
          aria-label="Schriftart"
          value={toolbarFormat?.fontFamily ?? 'Arial'}
          onPointerDown={rememberSelection}
          onChange={(event) => {
            if (event.target.value) applyFontFamily(event.target.value)
          }}
          className="h-8 rounded border border-stone-200 bg-white px-2 text-xs"
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>
        <select
          aria-label="Schriftgröße"
          value={toolbarFormat?.fontSize ?? '11pt'}
          onPointerDown={rememberSelection}
          onChange={(event) => {
            if (event.target.value) applyFontSize(event.target.value)
          }}
          className="h-8 rounded border border-stone-200 bg-white px-2 text-xs"
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>{size.replace('pt', '')} pt</option>
          ))}
        </select>
        <div className="flex items-center gap-0.5 pl-1" aria-label="Textfarbe">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Textfarbe ${color}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => formattingChain().setColor(color).run()}
              className="h-5 w-5 rounded-full border border-white shadow ring-1 ring-stone-200"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <Tool
          active={Boolean(formatBrush)}
          label={formatBrush
            ? 'Markierte Formatierung anwenden'
            : 'Formatierung der Markierung aufnehmen'}
          onClick={useFormatBrush}
        >
          🧹 {formatBrush ? 'Anwenden' : 'Format'}
        </Tool>
        {formatBrush && (
          <Tool label="Formatpinsel abbrechen" onClick={() => setFormatBrush(null)}>×</Tool>
        )}
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <Tool label="Tabelle einfügen" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Tabelle ＋</Tool>
        <Tool disabled={!editor.can().addRowAfter()} label="Zeile hinzufügen" onClick={() => editor.chain().focus().addRowAfter().run()}>Zeile ＋</Tool>
        <Tool disabled={!editor.can().deleteRow()} label="Zeile löschen" onClick={() => editor.chain().focus().deleteRow().run()}>Zeile −</Tool>
        <Tool disabled={!editor.can().addColumnAfter()} label="Spalte hinzufügen" onClick={() => editor.chain().focus().addColumnAfter().run()}>Spalte ＋</Tool>
        <Tool disabled={!editor.can().deleteColumn()} label="Spalte löschen" onClick={() => editor.chain().focus().deleteColumn().run()}>Spalte −</Tool>
        <Tool disabled={!editor.isActive('table')} label="Zeilenhöhe vergrößern" onClick={() => changeRowHeight(8)}>Höhe ＋</Tool>
        <Tool disabled={!editor.isActive('table')} label="Zeilenhöhe verkleinern" onClick={() => changeRowHeight(-8)}>Höhe −</Tool>
        <Tool disabled={!editor.can().mergeCells()} label="Markierte Zellen verbinden" onClick={() => editor.chain().focus().mergeCells().run()}>Zellen verbinden</Tool>
        <Tool disabled={!editor.can().splitCell()} label="Verbundene Zelle trennen" onClick={() => editor.chain().focus().splitCell().run()}>Zelle trennen</Tool>
        <Tool disabled={!editor.can().toggleHeaderRow()} label="Kopfzeile ein- oder ausschalten" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Kopfzeile</Tool>
        <div className="flex items-center gap-0.5 px-1" aria-label="Zellfarbe">
          {TABLE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              disabled={!editor.can().setCellAttribute('backgroundColor', color)}
              aria-label={`Zellfarbe ${color}`}
              title={`Zellfarbe ${color}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', color).run()}
              className="h-5 w-5 rounded border border-white shadow ring-1 ring-stone-200 disabled:cursor-not-allowed disabled:opacity-30"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <Tool disabled={!editor.can().deleteTable()} label="Tabelle vollständig löschen" onClick={() => editor.chain().focus().deleteTable().run()}>Tabelle löschen</Tool>
        {editor.isActive('table') && (
          <span className="px-1 text-[11px] text-stone-500">
            Spaltenlinie mit der Maus ziehen
          </span>
        )}
      </div>
      {clipboardMessage && (
        <div className="border-b border-stone-100 bg-stone-50 px-3 py-1 text-[11px] text-stone-600" role="status">
          {clipboardMessage}
        </div>
      )}
      <EditorContent editor={editor} />
    </>
  )
}

export function selectedFontFamily(textStyle: Record<string, unknown>): string {
  const fontFamily = textStyle.fontFamily
  return typeof fontFamily === 'string' && FONT_FAMILIES.includes(fontFamily)
    ? fontFamily
    : 'Arial'
}

export function formatBrushTextStyle(
  textStyle: Record<string, unknown>,
): Record<string, string> {
  const supported = ['fontFamily', 'fontSize', 'color', 'backgroundColor'] as const
  return Object.fromEntries(
    supported.flatMap((attribute) =>
      typeof textStyle[attribute] === 'string'
        ? [[attribute, textStyle[attribute]]]
        : []),
  )
}

export function selectedHeadingLevel(editor: {
  isActive: (name: string, attributes?: Record<string, unknown>) => boolean
}): 1 | 2 | 3 | null {
  if (editor.isActive('heading', { level: 1 })) return 1
  if (editor.isActive('heading', { level: 2 })) return 2
  if (editor.isActive('heading', { level: 3 })) return 3
  return null
}

function selectedTextAlign(editor: {
  isActive: (attributes: Record<string, unknown>) => boolean
}): 'left' | 'center' | 'right' | 'justify' {
  if (editor.isActive({ textAlign: 'center' })) return 'center'
  if (editor.isActive({ textAlign: 'right' })) return 'right'
  if (editor.isActive({ textAlign: 'justify' })) return 'justify'
  return 'left'
}

export function selectedFontSize(
  editor: {
    isActive: (name: string, attributes?: Record<string, unknown>) => boolean
  },
  textStyle: Record<string, unknown>,
): string {
  const fontSize = textStyle.fontSize
  if (typeof fontSize === 'string' && FONT_SIZES.includes(fontSize)) return fontSize
  if (typeof fontSize === 'string') return legacyFontSizeToPoints(fontSize)
  if (editor.isActive('heading', { level: 1 })) return '14pt'
  if (editor.isActive('heading', { level: 2 })) return '12pt'
  if (editor.isActive('heading', { level: 3 })) return '11pt'
  return '11pt'
}

function legacyFontSizeToPoints(fontSize: string): string {
  const match = fontSize.match(/^(\d+(?:\.\d+)?)px$/)
  if (!match) return '11pt'
  const points = Number(match[1]) * 0.75
  return FONT_SIZES.reduce((nearest, size) =>
    Math.abs(Number.parseFloat(size) - points) < Math.abs(Number.parseFloat(nearest) - points)
      ? size
      : nearest)
}

function Tool({
  active = false,
  disabled = false,
  label,
  onClick,
  children,
}: {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`h-8 rounded px-2 text-xs font-600 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active ? 'bg-blue-100 text-blue-800' : 'text-stone-700 hover:bg-stone-100'
      }`}
    >
      {children}
    </button>
  )
}
