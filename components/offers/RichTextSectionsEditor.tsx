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
import { Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import {
  decodeOfferText,
  encodeOfferText,
  isOfferTextDocumentEmpty,
  type OfferTextDocument,
  type OfferTextSection,
  type RichTextNode,
} from '@/lib/offers/rich-text'
import { normalizeWordHtml } from '@/lib/offers/word-paste'
import { ResponsiveTableView } from '@/components/offers/ResponsiveTableView'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'

interface RichTextSectionsEditorProps {
  name: string
  label: string
  defaultValue?: string
  placeholder: string
  onValueChange?: (value: string) => void
  removableSections?: boolean
  documentLayout?: boolean
  embeddedPositions?: ReactNode
  embeddedPositionsHasData?: boolean
  onEmbeddedPositionsRemoved?: () => void
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
        }
      : {}
  },
}

// Alte Dokumente dürfen rowHeight weiterhin laden. Der Wert wird bewusst weder
// aus HTML übernommen noch zurück in das DOM geschrieben: Tabellenzeilen folgen
// ausschließlich ihrer Inhaltshöhe.
const legacyTableRowHeight = {
  default: null,
  parseHTML: () => null,
  renderHTML: () => ({}),
}

function isDarkTableColor(color: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return false
  const red = Number.parseInt(color.slice(1, 3), 16)
  const green = Number.parseInt(color.slice(3, 5), 16)
  const blue = Number.parseInt(color.slice(5, 7), 16)
  return red * 0.299 + green * 0.587 + blue * 0.114 < 128
}

export const StyledTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colwidth: tableCellWidth,
      backgroundColor: tableCellBackground,
      rowHeight: legacyTableRowHeight,
    }
  },
})

export const StyledTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      colwidth: tableCellWidth,
      backgroundColor: tableCellBackground,
      rowHeight: legacyTableRowHeight,
    }
  },
})

export function RichTextSectionsEditor({
  name,
  label,
  defaultValue,
  placeholder,
  onValueChange,
  removableSections = false,
  documentLayout = false,
  embeddedPositions,
  embeddedPositionsHasData = false,
  onEmbeddedPositionsRemoved,
}: RichTextSectionsEditorProps) {
  const [document, setDocument] = useState<OfferTextDocument>(
    () => {
      const decoded = decodeOfferText(defaultValue)
      if (!embeddedPositions || decoded.positionsAfterSectionId !== undefined) return decoded
      return { ...decoded, positionsAfterSectionId: decoded.sections[0]?.id ?? null }
    },
  )
  const [removedSection, setRemovedSection] = useState<{ section: OfferTextSection; index: number } | null>(null)
  const [stickyTop, setStickyTop] = useState(8)

  useEffect(() => {
    const header = globalThis.document?.querySelector<HTMLElement>('[data-business-document-header]')
    if (!header) return
    const desktopHeader = globalThis.matchMedia('(min-width: 1024px)')
    const updateOffset = () => setStickyTop(desktopHeader.matches
      ? Math.ceil(header.getBoundingClientRect().height) + 8
      : 8)
    updateOffset()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOffset)
    observer?.observe(header)
    desktopHeader.addEventListener('change', updateOffset)
    return () => {
      observer?.disconnect()
      desktopHeader.removeEventListener('change', updateOffset)
    }
  }, [])

  const serialized = useMemo(
    () => isOfferTextDocumentEmpty(document) ? '' : encodeOfferText(document),
    [document],
  )

  useEffect(() => {
    onValueChange?.(serialized)
  }, [onValueChange, serialized])

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
    setDocument((current) => {
      const index = current.sections.findIndex((section) => section.id === id)
      if (index < 0 || (!removableSections && current.sections.length === 1)) return current
      setRemovedSection({ section: current.sections[index], index })
      return { ...current, sections: current.sections.filter((section) => section.id !== id) }
    })
  }

  function restoreSection() {
    if (!removedSection) return
    setDocument((current) => {
      const sections = [...current.sections]
      sections.splice(Math.min(removedSection.index, sections.length), 0, removedSection.section)
      return { ...current, sections }
    })
    setRemovedSection(null)
  }

  const positionsAfterSectionId = document.positionsAfterSectionId !== undefined &&
    (document.positionsAfterSectionId === null || document.sections.some((section) => section.id === document.positionsAfterSectionId))
    ? document.positionsAfterSectionId
    : document.sections[0]?.id ?? null

  function positionsBlock() {
    if (!embeddedPositions || document.positionsEnabled === false) return null
    const removeButton = (
      <button
        type="button"
        onClick={embeddedPositionsHasData ? undefined : removePositions}
        className="min-h-10 rounded px-3 text-sm font-500 text-red-600 hover:bg-red-50"
      >
        Entfernen
      </button>
    )
    return (
      <section
        className="form-section min-w-0 overflow-hidden p-0"
        data-service-report-positions-block
        aria-labelledby="service-positions-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-5 py-3">
          <h2 id="service-positions-title" className="text-sm font-600 text-foreground">Positionen</h2>
          {embeddedPositionsHasData ? (
            <ConfirmDialog
              trigger={removeButton}
              title="Positionskarte entfernen?"
              description="Die enthaltenen Positionen werden aus diesem Leistungsnachweis entfernt."
              confirmLabel="Positionskarte entfernen"
              danger
              onConfirm={async () => removePositions()}
            />
          ) : removeButton}
        </div>
        <div className="min-w-0 px-5 py-4">
          <label className="flex min-w-0 flex-col gap-1.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
            <span>Position im Dokument</span>
            <select
              aria-label="Position des Positionsblocks im Dokument"
              value={positionsAfterSectionId ?? ''}
              onChange={(event) => setDocument((current) => ({
                ...current,
                positionsAfterSectionId: event.target.value || null,
              }))}
              className="h-8 w-full min-w-0 rounded border border-stone-200 bg-white px-2 text-sm text-foreground sm:w-auto sm:min-w-48"
            >
              <option value="">Vor dem ersten Textbereich</option>
              {document.sections.map((section, index) => (
                <option key={section.id} value={section.id}>
                  Nach {section.title || `Bereich ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          {embeddedPositions}
        </div>
      </section>
    )
  }

  function removePositions() {
    setDocument((current) => ({ ...current, positionsEnabled: false }))
    onEmbeddedPositionsRemoved?.()
  }

  function addPositions() {
    setDocument((current) => ({
      ...current,
      positionsEnabled: true,
      positionsAfterSectionId: current.positionsAfterSectionId ?? current.sections[0]?.id ?? null,
    }))
  }

  return (
    <div className="w-full min-w-0">
      <input type="hidden" name={name} value={serialized} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="field-label">{label}</p>
          <p className="field-hint">Formatierung erscheint im fertigen Dokument, die Werkzeugleiste nur hier.</p>
        </div>
        <button
          type="button"
          onClick={addSection}
          className="inline-flex h-8 items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 text-xs font-500 text-blue-700 hover:bg-blue-100"
        >
          <span aria-hidden>＋</span> Textbereich
        </button>
        {embeddedPositions && document.positionsEnabled === false && (
          <button
            type="button"
            onClick={addPositions}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-3 text-xs font-500 text-blue-700 hover:bg-blue-100"
          >
            <span aria-hidden>＋</span> Positionen
          </button>
        )}
      </div>

      <div className={documentLayout ? 'space-y-6' : 'space-y-4'}>
        {embeddedPositions && document.positionsEnabled !== false && positionsAfterSectionId === null && positionsBlock()}
        {document.sections.map((section, index) => (
          <Fragment key={section.id}>
          <div
            className={documentLayout
              ? 'form-section min-w-0 p-0'
              : 'rounded-lg border border-stone-200 bg-white'}
          >
            <div className={documentLayout
              ? 'flex items-center gap-2 border-b border-stone-100 px-5 py-3'
              : 'flex items-center gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2'}>
              <input
                type="text"
                value={section.title}
                maxLength={200}
                onChange={(event) => updateSection(section.id, { title: event.target.value })}
                placeholder={`Überschrift Bereich ${index + 1} (optional)`}
                className="h-8 min-w-0 flex-1 rounded border border-stone-200 bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                disabled={!removableSections && document.sections.length === 1}
                onClick={() => removeSection(section.id)}
                aria-label={`Textbereich ${index + 1} entfernen`}
                className="min-h-10 rounded px-3 text-sm font-500 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                {removableSections ? 'Entfernen' : '−'}
              </button>
            </div>
            <div className={documentLayout ? 'min-w-0 px-1 pb-1' : undefined}>
              <RichTextArea
                editorId={section.id}
                content={section.content}
                placeholder={placeholder}
                onChange={(content) => updateSection(section.id, { content })}
                documentLayout={documentLayout}
                stickyTop={stickyTop}
              />
            </div>
          </div>
          {embeddedPositions && document.positionsEnabled !== false && positionsAfterSectionId === section.id && positionsBlock()}
          </Fragment>
        ))}
        {document.sections.length === 0 && (
          <div className="rounded-md border border-dashed border-stone-300 p-4 text-sm text-muted-foreground">Keine Inhaltsbereiche enthalten. Über „Textbereich“ kann ein neuer Bereich ergänzt werden.</div>
        )}
      </div>
      {removedSection && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm" role="status">
          <span>Bereich „{removedSection.section.title || 'Ohne Überschrift'}“ entfernt</span>
          <button type="button" onClick={restoreSection} className="min-h-10 px-2 font-600 text-blue-700 hover:underline">Rückgängig</button>
        </div>
      )}
    </div>
  )
}

function RichTextArea({
  editorId,
  content,
  placeholder,
  onChange,
  documentLayout,
  stickyTop,
}: {
  editorId: string
  content: RichTextNode
  placeholder: string
  onChange: (content: RichTextNode) => void
  documentLayout: boolean
  stickyTop: number
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
      Table.configure({ resizable: true, View: ResponsiveTableView }),
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
        class: 'offer-rich-editor min-h-36 w-full min-w-0 max-w-full px-4 py-3 focus:outline-none',
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
    selector: ({ editor: selectedEditor }) => readToolbarState(selectedEditor),
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
    formattingChain().toggleHeading({ level: 2 }).run()
  }

  function clearFormatting() {
    formattingChain().unsetAllMarks().setTextAlign('left').run()
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
    <div className={documentLayout ? 'min-w-0' : undefined}>
      <div
        id={`rich-text-toolbar-${editorId}`}
        className="z-20 flex w-full flex-wrap items-center gap-1 overflow-x-auto border-b border-stone-200 bg-white px-2 py-2 shadow-sm md:sticky"
        style={{ top: stickyTop }}
        data-rich-text-toolbar
        data-sticky-active="true"
      >
        <Tool
          disabled={!toolbarFormat?.canUndo}
          label="Rückgängig"
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </Tool>
        <Tool
          disabled={!toolbarFormat?.canRedo}
          label="Wiederholen"
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </Tool>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <Tool
          disabled={toolbarFormat?.selectionEmpty ?? true}
          label="Markierten Text ausschneiden"
          onClick={() => runClipboardCommand('cut')}
        >
          ✂ Ausschneiden
        </Tool>
        <Tool
          disabled={toolbarFormat?.selectionEmpty ?? true}
          label="Markierten Text kopieren"
          onClick={() => runClipboardCommand('copy')}
        >
          Kopieren
        </Tool>
        <Tool label="Inhalt mit Word-Formatierung einfügen" onClick={() => void pasteFromClipboard()}>
          Einfügen
        </Tool>
        <Tool
          disabled={toolbarFormat?.selectionEmpty ?? true}
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
        <Tool active={toolbarFormat?.bulletList} label="Aufzählung" onClick={() => formattingChain().toggleBulletList().run()}>• Liste</Tool>
        <Tool active={toolbarFormat?.orderedList} label="Nummerierung" onClick={() => formattingChain().toggleOrderedList().run()}>1. Liste</Tool>
        <span className="mx-1 h-5 w-px bg-stone-200" />
        {(['left', 'center', 'right'] as const).map((alignment) => (
          <Tool
            key={alignment}
            active={toolbarFormat?.textAlign === alignment}
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
              aria-pressed={toolbarFormat?.textColor === color}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => formattingChain().setColor(color).run()}
              className={`h-5 w-5 rounded-full border border-white shadow ring-1 ${
                toolbarFormat?.textColor === color ? 'ring-2 ring-blue-600' : 'ring-stone-200'
              }`}
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
        <Tool label="Formatierung zurücksetzen" onClick={clearFormatting}>
          Format zurücksetzen
        </Tool>
        {formatBrush && (
          <Tool label="Formatpinsel abbrechen" onClick={() => setFormatBrush(null)}>×</Tool>
        )}
        <span className="mx-1 h-5 w-px bg-stone-200" />
        <Tool label="Tabelle einfügen" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Tabelle ＋</Tool>
        <Tool disabled={!toolbarFormat?.canAddRow} label="Zeile hinzufügen" onClick={() => editor.chain().focus().addRowAfter().run()}>Zeile ＋</Tool>
        <Tool disabled={!toolbarFormat?.canDeleteRow} label="Zeile löschen" onClick={() => editor.chain().focus().deleteRow().run()}>Zeile −</Tool>
        <Tool disabled={!toolbarFormat?.canAddColumn} label="Spalte hinzufügen" onClick={() => editor.chain().focus().addColumnAfter().run()}>Spalte ＋</Tool>
        <Tool disabled={!toolbarFormat?.canDeleteColumn} label="Spalte löschen" onClick={() => editor.chain().focus().deleteColumn().run()}>Spalte −</Tool>
        <Tool disabled={!toolbarFormat?.canMergeCells} label="Markierte Zellen verbinden" onClick={() => editor.chain().focus().mergeCells().run()}>Zellen verbinden</Tool>
        <Tool disabled={!toolbarFormat?.canSplitCell} label="Verbundene Zelle trennen" onClick={() => editor.chain().focus().splitCell().run()}>Zelle trennen</Tool>
        <Tool disabled={!toolbarFormat?.canToggleHeaderRow} label="Kopfzeile ein- oder ausschalten" onClick={() => editor.chain().focus().toggleHeaderRow().run()}>Kopfzeile</Tool>
        <div className="flex items-center gap-0.5 px-1" aria-label="Zellfarbe">
          {TABLE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              disabled={!toolbarFormat?.canSetCellBackground}
              aria-label={`Zellfarbe ${color}`}
              aria-pressed={toolbarFormat?.cellBackground === color}
              title={`Zellfarbe ${color}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.chain().focus().setCellAttribute('backgroundColor', color).run()}
              className={`h-5 w-5 rounded border border-white shadow ring-1 disabled:cursor-not-allowed disabled:opacity-30 ${
                toolbarFormat?.cellBackground === color ? 'ring-2 ring-blue-600' : 'ring-stone-200'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
        <Tool disabled={!toolbarFormat?.canDeleteTable} label="Tabelle vollständig löschen" onClick={() => editor.chain().focus().deleteTable().run()}>Tabelle löschen</Tool>
        {toolbarFormat?.table && (
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
    </div>
  )
}

export function selectedFontFamily(textStyle: Record<string, unknown>): string {
  const fontFamily = textStyle.fontFamily
  return typeof fontFamily === 'string' && FONT_FAMILIES.includes(fontFamily)
    ? fontFamily
    : 'Arial'
}

export function readToolbarState(editor: import('@tiptap/core').Editor | null) {
  if (!editor) {
    return {
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      heading2: false,
      bulletList: false,
      orderedList: false,
      table: false,
      textAlign: 'left' as const,
      fontFamily: 'Arial',
      fontSize: '11pt',
      textColor: null,
      cellBackground: null,
      selectionEmpty: true,
      canUndo: false,
      canRedo: false,
      canAddRow: false,
      canDeleteRow: false,
      canAddColumn: false,
      canDeleteColumn: false,
      canMergeCells: false,
      canSplitCell: false,
      canToggleHeaderRow: false,
      canSetCellBackground: false,
      canDeleteTable: false,
    }
  }

  const textStyle = editor.getAttributes('textStyle') as Record<string, unknown>
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    heading2: selectedHeadingLevel(editor) === 2,
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    table: editor.isActive('table'),
    textAlign: selectedTextAlign(editor),
    fontFamily: selectedFontFamily(textStyle),
    fontSize: selectedFontSize(editor, textStyle),
    textColor: typeof textStyle.color === 'string' ? textStyle.color : null,
    cellBackground: selectedCellBackground(editor),
    selectionEmpty: editor.state.selection.empty,
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    canAddRow: editor.can().addRowAfter(),
    canDeleteRow: editor.can().deleteRow(),
    canAddColumn: editor.can().addColumnAfter(),
    canDeleteColumn: editor.can().deleteColumn(),
    canMergeCells: editor.can().mergeCells(),
    canSplitCell: editor.can().splitCell(),
    canToggleHeaderRow: editor.can().toggleHeaderRow(),
    canSetCellBackground: editor.can().setCellAttribute('backgroundColor', '#ffffff'),
    canDeleteTable: editor.can().deleteTable(),
  }
}

function selectedCellBackground(editor: import('@tiptap/core').Editor): string | null {
  const cell = editor.getAttributes('tableCell').backgroundColor
  const header = editor.getAttributes('tableHeader').backgroundColor
  return typeof cell === 'string' ? cell : typeof header === 'string' ? header : null
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
