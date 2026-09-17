import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { deriveBusinessProcessStages, derivePurchaseOrderIndicatorState, deriveWorkflowIndicatorState, isBusinessProcessCompleted, isBusinessProcessStageCompleted } from '@/lib/workflow/business-process'
import type { BusinessProcessData } from '@/lib/services/business-process.service'
import { isOfferTransitionAllowed } from '@/types/enums'

const offer = { id: 'offer-1', number: 'AN-1', status: 'ACCEPTED' }
const order = { id: 'order-1', number: 'AU-1', status: 'COMPLETED' }
const report = { id: 'report-1', number: 'LN-1', status: 'FINALIZED', finalizedAt: new Date(), sentAt: new Date(), confirmedAt: new Date() }
const invoice = { id: 'invoice-1', number: 'RE-1', status: 'FINALIZED', type: 'STANDARD' }

const data = (partial: Partial<BusinessProcessData>): BusinessProcessData => ({
  offer: null, order: null, serviceReports: [], invoices: [], ...partial,
})
const states = (process: BusinessProcessData) => Object.fromEntries(
  deriveBusinessProcessStages(process).map((stage) => [stage.key, stage.state]),
)

describe('einheitlicher Geschäftsvorgang-Navigator', () => {
  it('trennt Versand, Kundenentscheidung und Folgeobjekte fachlich', () => {
    expect(isOfferTransitionAllowed('DRAFT', 'SENT')).toBe(true)
    expect(isOfferTransitionAllowed('SENT', 'ACCEPTED')).toBe(true)
    expect(isOfferTransitionAllowed('SENT', 'REJECTED')).toBe(true)
    expect(isOfferTransitionAllowed('SENT', 'CONVERTED_TO_ORDER')).toBe(false)

    const sent = data({ offer: { ...offer, status: 'SENT' } })
    expect(sent.customerPurchaseOrder).toBeUndefined()
    expect(sent.order).toBeNull()
    expect(states(sent).offer).toBe('current')
  })

  it('markiert bei nur angenommenem Angebot den Auftrag als nächsten Schritt', () => {
    expect(states(data({ offer }))).toEqual({ offer: 'existing', order: 'current', serviceReport: 'later', invoice: 'later' })
  })

  it('markiert bei Angebot und Auftrag den Leistungsnachweis als nächsten Schritt', () => {
    expect(states(data({ offer, order }))).toEqual({ offer: 'existing', order: 'existing', serviceReport: 'current', invoice: 'later' })
  })

  it('markiert ein noch nicht angenommenes Angebot selbst als aktuellen Schritt', () => {
    expect(states(data({ offer: { ...offer, status: 'SENT' } }))).toEqual({ offer: 'current', order: 'later', serviceReport: 'later', invoice: 'later' })
  })

  it('markiert einen laufenden Auftrag ohne Leistung weiter als aktuellen Auftrag', () => {
    expect(states(data({ offer, order: { ...order, status: 'IN_PROGRESS' } }))).toEqual({ offer: 'existing', order: 'existing', serviceReport: 'current', invoice: 'later' })
  })

  it('markiert nach vorhandenem Leistungsnachweis die Rechnung als nächsten Schritt', () => {
    expect(states(data({ offer, order, serviceReports: [report] })).invoice).toBe('current')
  })

  it('berechnet den Abschluss jedes Hauptschritts aus seinem vollständigen Lebenszyklus', () => {
    const completeProcess = data({
      offer: { ...offer, status: 'CONVERTED_TO_ORDER' },
      order: { ...order, sentAt: new Date(), confirmedAt: new Date() },
      serviceReports: [report],
      invoices: [{ ...invoice, status: 'PAID' }],
      customerPurchaseOrder: { id: 'po-1', orderNumber: null, orderDate: null, documents: [{ id: 'doc-1', originalName: 'Bestellung.pdf', mimeType: 'application/pdf' }] },
    })
    for (const key of ['offer', 'order', 'serviceReport', 'invoice'] as const) {
      expect(isBusinessProcessStageCompleted(key, completeProcess)).toBe(true)
      expect(deriveWorkflowIndicatorState(key, completeProcess, 'existing')).toBe('completed')
    }
    expect(derivePurchaseOrderIndicatorState(completeProcess)).toBe('completed')
    expect(isBusinessProcessCompleted(completeProcess)).toBe(true)
  })

  it('wertet bloße Existenz nicht als Abschluss', () => {
    const incomplete = data({
      offer,
      order: { ...order, sentAt: null, confirmedAt: null },
      serviceReports: [{ ...report, confirmedAt: null }],
      invoices: [invoice],
    })
    for (const key of ['offer', 'order', 'serviceReport', 'invoice'] as const) {
      expect(isBusinessProcessStageCompleted(key, incomplete)).toBe(false)
      expect(deriveWorkflowIndicatorState(key, incomplete, 'existing')).toBe('pending')
    }
    expect(isBusinessProcessCompleted(incomplete)).toBe(false)
  })

  it.each([
    { invoiceStatus: 'DRAFT', label: 'Rechnungsentwurf' },
    { invoiceStatus: 'FINALIZED', label: 'finalisierte Rechnung' },
    { invoiceStatus: 'SENT', label: 'versendete offene Rechnung' },
    { invoiceStatus: 'PARTIALLY_PAID', label: 'teilbezahlte Rechnung' },
  ])('zeigt für $label keinen Gesamtabschluss', ({ invoiceStatus }) => {
    const process = data({
      offer: { ...offer, status: 'CONVERTED_TO_ORDER' },
      order: { ...order, sentAt: new Date(), confirmedAt: new Date() },
      serviceReports: [report],
      invoices: [{ ...invoice, status: invoiceStatus }],
      customerPurchaseOrder: { id: 'po-1', orderNumber: null, orderDate: null, documents: [{ id: 'doc-1', originalName: 'Bestellung.pdf', mimeType: 'application/pdf' }] },
    })
    expect(isBusinessProcessCompleted(process)).toBe(false)
  })

  it('unterscheidet aktive und gesperrte Hauptschritte', () => {
    const process = data({ offer: { ...offer, status: 'SENT' } })
    expect(deriveWorkflowIndicatorState('offer', process, 'current')).toBe('active')
    expect(deriveWorkflowIndicatorState('order', process, 'unavailable')).toBe('blocked')
    expect(derivePurchaseOrderIndicatorState(process)).toBe('pending')
  })

  it.each([
    { ...report, status: 'DRAFT' },
    { ...report, finalizedAt: null },
    { ...report, sentAt: null },
    { ...report, confirmedAt: null },
  ])('hält die Rechnung bis zum vollständig abgeschlossenen Leistungsnachweis gesperrt', incompleteReport => {
    const result = states(data({ offer, order, serviceReports: [incompleteReport] }))
    expect(result.serviceReport).toBe('current')
    expect(result.invoice).toBe('later')
  })

  it('stellt einen vollständigen Prozess vollständig als vorhanden dar', () => {
    expect(Object.values(states(data({ offer, order, serviceReports: [report], invoices: [invoice] }))))
      .toEqual(['existing', 'existing', 'existing', 'existing'])
  })

  it('behandelt Direktaufträge ohne erfundenes Angebot', () => {
    const stages = deriveBusinessProcessStages(data({ order }))
    expect(stages[0]).toMatchObject({ state: 'unavailable', hint: 'Direktauftrag ohne Angebot' })
    expect(stages[2].state).toBe('current')
  })

  it('erfindet bei einer freien Rechnung keinen vorgelagerten Vorgang', () => {
    const stages = deriveBusinessProcessStages(data({ invoices: [invoice] }))
    expect(stages.slice(0, 3).every((stage) => stage.state === 'unavailable')).toBe(true)
    expect(stages[3].state).toBe('existing')
  })

  it('blockiert den Rechnungsübergang bei historischen Mehrfach-Leistungsnachweisen', () => {
    const stages = deriveBusinessProcessStages(data({
      offer, order,
      serviceReports: [report, { ...report, id: 'report-2', number: 'LN-2' }],
      invoices: [invoice, { ...invoice, id: 'invoice-2', number: 'RE-2' }],
    }))
    expect(stages.find((stage) => stage.key === 'serviceReport')?.documents).toHaveLength(2)
    expect(stages.find((stage) => stage.key === 'invoice')?.documents).toHaveLength(2)
    expect(stages.find((stage) => stage.key === 'serviceReport')).toMatchObject({ state: 'special' })
    expect(stages.find((stage) => stage.key === 'invoice')).toMatchObject({ state: 'unavailable' })
  })

  it('kennzeichnet Storno und Korrektur als Sonderstatus', () => {
    const corrected = { ...invoice, status: 'CORRECTED', type: 'STANDARD' }
    expect(states(data({ order, invoices: [corrected] })).invoice).toBe('special')
    expect(states(data({ order, invoices: [{ ...invoice, type: 'CANCELLATION' }] })).invoice).toBe('special')
  })

  it('verwendet auf allen vier Detailseiten dieselbe Komponente', () => {
    for (const file of ['offers/[id]/page.tsx', 'orders/[id]/page.tsx', 'services/[id]/page.tsx', 'invoices/[id]/page.tsx']) {
      const source = readFileSync(resolve(process.cwd(), 'app/(dashboard)', file), 'utf8')
      expect(source).toContain('<BusinessProcessWorkflow')
      expect(source.match(/<BusinessProcessWorkflow/g)).toHaveLength(1)
      const layoutStart = source.indexOf('<BusinessDocumentLayout>')
      const sidebarStart = source.indexOf('<BusinessDocumentSidebar', layoutStart)
      const workflowStart = source.indexOf('<BusinessProcessWorkflow', sidebarStart)
      expect(layoutStart).toBeGreaterThan(0)
      expect(sidebarStart).toBeGreaterThan(layoutStart)
      expect(workflowStart).toBeGreaterThan(sidebarStart)
      expect(source.slice(0, layoutStart)).not.toContain('<BusinessProcessWorkflow')
    }
  })

  it('rendert den gemeinsamen Workflow kompakt vertikal in der Sidebar', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    expect(source).toContain('data-business-workflow-sidebar')
    expect(source).toContain('className="card-base p-6"')
    expect(source).not.toContain("before:left-3")
    expect(source).toContain('data-workflow-connector={connector}')
    expect(source).toContain('absolute -bottom-9 left-[11px] top-6')
    expect(source).toContain('relative min-w-0 pl-8')
    expect(source).not.toContain('xl:grid-cols-4')
    expect(source).toContain('aria-label="Geschäftsvorgang"')
    expect(source).toContain('function WorkflowStepIndicator')
    expect(source).toContain("completed: { icon: '✓', className: 'border-emerald-600 bg-emerald-600 text-white'")
    expect(source).toContain("connector === 'completed' ? 'bg-emerald-600' : 'bg-stone-200'")
    expect(source).toContain('data-workflow-completion')
    expect(source).toContain('Vorgang abgeschlossen')
    expect(source).toContain('Alle Prozessschritte erledigt')
  })

  it('stellt den Angebotslebenszyklus auf einer gemeinsamen Achse und ohne horizontale Aktionsquetschung dar', () => {
    const workflow = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    const actions = readFileSync(resolve(process.cwd(), 'components/offers/OfferStatusActions.tsx'), 'utf8')
    expect(workflow).toContain('Angebot versendet')
    expect(workflow).toContain('Weiter nach Annahme')
    expect(workflow).not.toContain('Weiter nur bei Annahme ↓')
    expect(actions).toContain("compactDecision ? 'grid w-full grid-cols-1 gap-2'")
    expect(actions).not.toContain('xl:grid-cols-3')
    for (const label of ['Angenommen', 'Abgelehnt', 'Abgelaufen']) {
      expect(actions).toContain(`label="${label}"`)
    }
    expect(actions).toContain('forwardRef<HTMLButtonElement')
    expect(actions).toContain('{...buttonProps}')
    expect(actions).toContain('ref={ref}')
    expect(actions).toContain('min-h-9 w-full')
    expect(actions).toContain('leading-tight')
    expect(actions).toContain('router.refresh()')
    expect(actions).toContain('statusChangePending.current')
  })

  it('schließt den Bestätigungsdialog vor der Server Action und lässt kein Backdrop zurück', () => {
    const dialog = readFileSync(resolve(process.cwd(), 'components/shared/ConfirmDialog.tsx'), 'utf8')
    const close = dialog.indexOf('setOpen(false)', dialog.indexOf('function handleConfirm'))
    const action = dialog.indexOf('await onConfirm()', dialog.indexOf('function handleConfirm'))
    expect(close).toBeGreaterThan(0)
    expect(close).toBeLessThan(action)
    expect(dialog).toContain('submittingRef.current')
    expect(dialog).toContain("className={isPending ? 'pointer-events-none opacity-70'")
    expect(dialog).toContain("import { createPortal } from 'react-dom'")
    expect(dialog).toContain('document.body')
    expect(dialog).toContain('aria-modal="true"')
  })

  it('zeigt entschiedene Angebote kompakt und mit eindeutiger Fortsetzung an', () => {
    const workflow = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    expect(workflow).toContain("detail: '✓ Angebot angenommen'")
    expect(workflow).toContain("detail: '× Angebot abgelehnt · Prozess beendet'")
    expect(workflow).toContain("detail: '◷ Angebot abgelaufen · Prozess beendet'")
    expect(workflow).toContain("status === 'SENT' ? <div")
  })

  it('zeigt die Kundenbestellung ab SENT als eigenen Folgeschritt', () => {
    const workflow = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    expect(workflow).toContain("['SENT', 'ACCEPTED', 'CONVERTED_TO_ORDER'].includes(process.offer.status)")
    expect(workflow).toContain("process.offer?.status === 'SENT'")
    expect(workflow).toContain('Noch nicht vorhanden · nach Annahme ergänzbar')
    expect(workflow).toContain('2 Kundenbestellung')
    expect(workflow).toContain('offerBasedStageNumber')
  })

  it('richtet Workflow- und Formularüberschrift über denselben Karteninnenabstand aus', () => {
    const workflow = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    const layout = readFileSync(resolve(process.cwd(), 'components/documents/BusinessDocumentLayout.tsx'), 'utf8')
    const formStyles = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    expect(workflow).toContain('card-base p-6')
    expect(layout).toContain('card-base p-6')
    expect(formStyles).toContain('rounded-lg border border-stone-200 p-6')
  })

  it('verwendet ein gemeinsames responsives Dokumentlayout mit stabiler rechter Spalte', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/documents/BusinessDocumentLayout.tsx'), 'utf8')
    expect(source).toContain('data-business-document-layout')
    expect(source).toContain('grid-cols-1')
    expect(source).toContain('lg:grid-cols-[minmax(0,1fr)_20px_var(--document-sidebar-width)]')
    expect(source).toContain('data-business-document-sidebar')
    expect(source).toContain('sticky = true')
    expect(source).toContain('items-start')
    expect(source).toContain('lg:max-h-[calc(100vh-var(--document-sticky-header-height,0px)-2rem)]')
    expect(source).toContain('lg:overflow-y-auto')
    expect(source.indexOf('{columns[0]}')).toBeLessThan(source.indexOf('export function BusinessDocumentSidebar'))
  })

  it('hält Dokumentkopf und Workflow auf Desktop erreichbar, ohne Mobile-Sticky zu erzwingen', () => {
    const header = readFileSync(resolve(process.cwd(), 'components/documents/StickyDocumentPageHeader.tsx'), 'utf8')
    const layout = readFileSync(resolve(process.cwd(), 'components/documents/BusinessDocumentLayout.tsx'), 'utf8')
    expect(header).toContain('lg:sticky lg:top-0')
    expect(header).toContain('lg:z-30')
    expect(header).toContain('ResizeObserver')
    expect(header).toContain('--document-sticky-header-height')
    expect(layout).toContain('lg:top-[calc(var(--document-sticky-header-height,0px)+1rem)]')
    for (const file of ['offers/[id]/page.tsx', 'orders/[id]/page.tsx', 'services/[id]/page.tsx', 'invoices/[id]/page.tsx']) {
      expect(readFileSync(resolve(process.cwd(), 'app/(dashboard)', file), 'utf8')).toContain('<BusinessDocumentSidebar sticky>')
    }
  })

  it('verwendet den gemessenen Sticky-Kopf auch auf allen Erstellungs- und Bearbeitungsseiten', () => {
    const pageHeader = readFileSync(resolve(process.cwd(), 'components/shared/PageHeader.tsx'), 'utf8')
    expect(pageHeader).toContain('<StickyDocumentPageHeader>{content}</StickyDocumentPageHeader>')
    for (const file of [
      'offers/new/page.tsx', 'offers/[id]/edit/page.tsx',
      'orders/new/page.tsx', 'orders/[id]/edit/page.tsx',
      'services/new/page.tsx', 'services/[id]/edit/page.tsx',
    ]) {
      const page = readFileSync(resolve(process.cwd(), 'app/(dashboard)', file), 'utf8')
      expect(page).toMatch(/<PageHeader\s+sticky/)
      expect(page).toContain('<BusinessDocumentSidebar sticky>')
    }
    for (const file of ['invoices/new/page.tsx', 'invoices/[id]/edit/page.tsx']) {
      expect(readFileSync(resolve(process.cwd(), 'app/(dashboard)', file), 'utf8')).toContain('<InvoiceDocumentHeader')
    }
  })

  it('bündelt Statusaktionen im Workflow und belässt Details danach in der rechten Spalte', () => {
    for (const file of ['offers/[id]/page.tsx', 'orders/[id]/page.tsx', 'invoices/[id]/page.tsx']) {
      const source = readFileSync(resolve(process.cwd(), 'app/(dashboard)', file), 'utf8')
      const sidebar = source.slice(source.indexOf('<BusinessDocumentSidebar'), source.indexOf('</BusinessDocumentSidebar>'))
      if (file.startsWith('offers/')) {
        expect(sidebar).toContain('offerLifecycle={{')
        expect(sidebar.indexOf('<BusinessProcessWorkflow')).toBeLessThan(sidebar.indexOf('Details'))
        expect(sidebar).not.toContain('id="document-status-actions"')
      } else {
        expect(sidebar).not.toContain('id="document-status-actions"')
        expect(sidebar.indexOf('<BusinessProcessWorkflow')).toBeLessThan(sidebar.indexOf('Details'))
        if (file.startsWith('orders/')) expect(sidebar).toContain('orderAction={<OrderStatusActions')
        if (file.startsWith('invoices/')) expect(sidebar).toContain('invoiceAction={<InvoiceActions')
      }
    }
  })

  it('erhält die Auftrags-PDF-Aktion und trennt geöffnetes Dokument vom nächsten Schritt', () => {
    const source = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    expect(source).toContain('<OrderPdfDialog orderId={documentId} />')
    expect(source.indexOf("if (stageKey === 'order')")).toBeLessThan(source.indexOf("if (stageKey === 'invoice')"))
    expect(source).toContain('stage.key === currentDocument.type')
    expect(source).toContain("stage.state === 'current'")
    expect(source).toContain('stage.key === activeStage')
    expect(source).not.toContain('activeStage ?? currentDocument.type')
  })

  it('leitet Berechtigungen serverseitig über die bestehende Matrix ab', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/workflow/business-process-permissions.ts'), 'utf8')
    expect(source).toContain('hasPermission(Resource.OFFER, Action.READ)')
    expect(source).toContain('hasPermission(Resource.SERVICE_REPORT, Action.CREATE)')
    const dataSource = readFileSync(resolve(process.cwd(), 'lib/services/business-process.service.ts'), 'utf8')
    expect(dataSource).toContain('role === RoleName.EMPLOYEE')
    const component = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    expect(component).toContain('!canReadStage(stage.key, permissions)')
    expect(component).toContain('Keine Leseberechtigung')
  })

  it('prüft auf allen Detailseiten die Haupt-Leseberechtigung vor dem Workflow-Service', () => {
    for (const file of ['offers/[id]/page.tsx', 'orders/[id]/page.tsx', 'services/[id]/page.tsx', 'invoices/[id]/page.tsx']) {
      const source = readFileSync(resolve(process.cwd(), 'app/(dashboard)', file), 'utf8')
      const pageStart = source.indexOf('export default')
      const permissionCheck = source.indexOf('await requirePermission(', pageStart)
      const processCall = source.indexOf('getBusinessProcessFor', pageStart)
      expect(permissionCheck).toBeGreaterThan(pageStart)
      expect(permissionCheck).toBeLessThan(processCall)
    }
  })

  it('rekonstruiert den Vorgang mit gezielten Selects ohne Positions- oder Vollobjekt-Loads', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/services/business-process.service.ts'), 'utf8')
    expect(source).toContain('const orderProcessSelect')
    expect(source).toContain('id: true, reportNumber: true, status: true, finalizedAt: true, sentAt: true, confirmedAt: true')
    expect(source).toContain('select: { id: true, invoiceNumber: true, status: true, type: true }')
    expect(source).not.toContain('include:')
  })

  it('zeigt Versand und Kundenbestätigung für Auftrag und Leistungsnachweis als eigenen Lebenszyklus', () => {
    const workflow = readFileSync(resolve(process.cwd(), 'components/workflow/BusinessProcessWorkflow.tsx'), 'utf8')
    const controls = readFileSync(resolve(process.cwd(), 'components/workflow/DocumentLifecycleControls.tsx'), 'utf8')
    expect(workflow).toContain('✓ Erstellt')
    expect(workflow).toContain('○ Noch nicht versendet')
    expect(workflow).toContain('⚠ Bestätigung offen')
    expect(workflow).toContain('✓ Bestätigt')
    expect(workflow).toContain('✓ Bestätigung nicht erforderlich')
    expect(workflow).toContain('Bestätigung öffnen:')
    expect(controls).toContain('Als versendet markieren')
    expect(controls).toContain('Bestätigung hochladen')
    expect(controls).toContain('Auftrag bestätigen')
    expect(controls).toContain('Bestätigung bearbeiten')
    expect(controls).toContain('pending.current')
  })

  it('speichert die Auftragsbestätigungsart am Auftrag und erzeugt Dokumente nur bei Datei', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const service = readFileSync(resolve(process.cwd(), 'lib/services/external-confirmation.service.ts'), 'utf8')
    const dialog = readFileSync(resolve(process.cwd(), 'components/documents/ExternalConfirmationDialog.tsx'), 'utf8')
    expect(schema).toContain('enum OrderConfirmationType')
    for (const type of ['SIGNED_DOCUMENT', 'EMAIL', 'VERBAL', 'CUSTOMER_PURCHASE_ORDER', 'NOT_REQUIRED']) expect(schema).toContain(type)
    expect(schema).toContain('confirmationNote String?')
    expect(service).toContain("if (!preparedFile) return null")
    expect(service).toContain("input.confirmationType === 'CUSTOMER_PURCHASE_ORDER'")
    expect(service).toContain("action: 'STATUS_CHANGE'")
    expect(service).toContain("action: 'DOCUMENT_UPLOADED'")
    expect(dialog).toContain("type === 'SIGNED_DOCUMENT'")
  })

  it('modelliert die neuen Zustände additiv und verändert operative Statuswerte nicht', () => {
    const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const migration = readFileSync(resolve(process.cwd(), 'prisma/migrations_archive_20260915_pre_canonical_baseline/20260910190000_add_document_delivery_lifecycle/migration.sql'), 'utf8')
    expect(schema.match(/sentAt\s+DateTime\?/g)?.length).toBeGreaterThanOrEqual(3)
    expect(schema.match(/confirmedAt\s+DateTime\?/g)?.length).toBe(2)
    expect(migration).toContain('ALTER TABLE "orders"')
    expect(migration).toContain('ALTER TABLE "service_reports"')
    expect(migration).not.toMatch(/DROP|DELETE|TRUNCATE/i)
  })
})
