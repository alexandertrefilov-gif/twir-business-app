// GGA-Portal Business → Project → Collaboration Release
// Dieser Handover-Service ist bewusst zweigeteilt, seit die automatische
// Collaboration-Aktivierung entfernt wurde (siehe "BUSINESS → PROJECT →
// COLLABORATION RELEASE"):
//
//   1. ensureProjectForOrder() — läuft WEITERHIN automatisch nach jeder
//      erfolgreichen Order-Entstehung (createOrder()/convertOfferToOrder()).
//      Stellt ausschließlich Order → Project sicher (anlegen, falls nötig,
//      sonst wiederverwenden) — KEIN CollaborationProject entsteht hier
//      mehr. Der Normalzustand nach einem Auftrag ist ab jetzt: Project
//      existiert, CollaborationProject existiert NICHT.
//   2. ensureActorMembership() — bleibt als eigenständiger, exportierter,
//      idempotenter Baustein bestehen, wird aber nicht mehr automatisch
//      aufgerufen. Die bewusste Aktion "Für Zusammenarbeit freigeben"
//      (activateProjectCollaborationAction, app/(dashboard)/projects/
//      actions.ts) ruft weiterhin die bereits bestehende, bereits
//      idempotente activateCollaboration(projectId, actor) direkt auf und
//      nutzt DIESELBE Membership-Funktion hier, statt eine zweite
//      Membership-Logik zu bauen.
//
// Kanonischer Trigger für die Project-Erzeugung (unverändert verbindlich
// entschieden): die erfolgreiche Entstehung eines `Order` — nicht bereits
// `Offer.status === 'ACCEPTED'` allein. Beide Order-Entstehungspfade
// (createOrder() direkt, convertOfferToOrder() aus einem angenommenen
// Angebot) münden weiterhin in denselben Übergabepunkt hier.
//
// Transaktionsgrenze (unverändert gegenüber b787233): createOrder()/
// convertOfferToOrder()/createProject()/assignOrderToProject() eröffnen
// JEWEILS ihre eigene prisma.$transaction() und nehmen keinen externen
// Transaction-Client entgegen. Eine einzige durchgehende DB-Transaktion
// über Order-Erstellung UND Project-Zuordnung hinweg ist daher ohne
// Signaturänderung dieser bestehenden, an vielen weiteren Stellen
// verwendeten Funktionen nicht erreichbar — das wäre ein größerer, hier
// nicht angeforderter Service-Umbau. Stattdessen folgt dieser Handover
// demselben, bereits im Code etablierten Muster wie die Dokumenten-
// archivierung (archiveBusinessDocument()): ein nicht-blockierender
// Folgeschritt nach der bereits erfolgreich committeten Order-Erstellung,
// der bei Fehlschlag NICHT die gesamte Aktion scheitern lässt, sondern
// (a) niemals eine Exception unbemerkt verschluckt — jeder Fehlschlag wird
// über einen Audit-Log-Eintrag sichtbar dokumentiert, und (b) durch die
// vollständige Idempotenz jedes einzelnen Schritts (Project.projectNumber
// @unique, CollaborationProject.internalProjectId @unique,
// CollaborationMembership @@unique([userId, projectId])) jederzeit
// gefahrlos erneut aufgerufen werden kann, bis er vollständig durchläuft.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { ConflictError, NotFoundError } from '@/lib/auth/permissions'
import { writeAuditLog } from '@/lib/services/audit.service'
import { createProject, assignOrderToProject } from '@/lib/services/project.service'
import { CollaborationRole } from '@prisma/client'

// Robustheits-Review T12: kurze, begrenzte Wartezeit, in der ein paralleler
// Handover-Versuch für DENSELBEN Order seine eigene assignOrderToProject()-
// Zuordnung abschließen kann, bevor der verlierende Aufruf endgültig
// aufgibt — kein Polling ohne Obergrenze, keine neue Architektur.
const WINNER_VERIFY_ATTEMPTS = 8
const WINNER_VERIFY_DELAY_MS = 25

type Actor = { userId: string; userEmail: string }

export interface ProjectHandoverResult {
  status: 'linked' | 'failed'
  projectId?: string
  error?: string
}

// Project-Grunddaten ausschließlich aus bereits vorhandenen, zuverlässigen
// Order-/Customer-Feldern — Order kennt keinen eigenen Standort/Gebäude/
// Etage/Bereich, diese bleiben deshalb bewusst leer statt erfunden.
async function createOrReuseProjectForOrder(
  order: { id: string; projectId: string | null; customerId: string; title: string | null; orderNumber: string },
  actor: Actor,
): Promise<string> {
  if (order.projectId) return order.projectId
  try {
    const projectId = await createProject(
      { projectNumber: order.orderNumber, name: order.title?.trim() || order.orderNumber, customerId: order.customerId },
      actor,
    )
    await assignOrderToProject(projectId, order.id, actor)
    return projectId
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error
    // createProject() nutzt order.orderNumber als deterministische
    // projectNumber — ein ConflictError hier bedeutet entweder (a) ein
    // paralleler Handover-Versuch für DENSELBEN Order hat soeben gewonnen,
    // oder (b) ein fachlich FREMDES, unabhängig angelegtes Project trägt
    // zufällig dieselbe Nummer. Fall (b) darf NIEMALS automatisch
    // übernommen werden — deshalb wird die Relation zum Order explizit
    // verifiziert, nicht nur der Name abgeglichen.
    const candidate = await prisma.project.findFirst({
      where: { projectNumber: order.orderNumber, deletedAt: null },
      select: { id: true, customerId: true },
    })
    // Erstes, sofortiges Signal gegen Fall (b): ein echter Gewinner dieses
    // Handovers wurde mit exakt order.customerId angelegt (siehe oben).
    if (!candidate || candidate.customerId !== order.customerId) throw error

    // Der echte Gewinner verknüpft order.projectId typischerweise binnen
    // weniger Millisekunden — kurz, begrenzt nachprüfen statt sofort
    // aufzugeben. Erst eine tatsächlich bestätigte Order-Relation gilt als
    // "eindeutig derselbe Order/Project-Kontext".
    for (let attempt = 0; attempt < WINNER_VERIFY_ATTEMPTS; attempt++) {
      const current = await prisma.order.findUnique({ where: { id: order.id }, select: { projectId: true } })
      if (current?.projectId === candidate.id) return candidate.id
      // order.projectId zeigt bereits eindeutig auf ein ANDERES Project —
      // kein Grund mehr zu warten, das ist kein Duplikat unseres Versuchs.
      if (current?.projectId && current.projectId !== candidate.id) throw error
      await new Promise((resolve) => setTimeout(resolve, WINNER_VERIFY_DELAY_MS))
    }
    // Nach der Wartezeit weiterhin keine bestätigte Relation — lieber ein
    // sauberer Konflikt als eine unbestätigte Übernahme eines fremden Project.
    throw error
  }
}

/**
 * Automatischer Business → Project Handover.
 * Aufzurufen NACH erfolgreicher, bereits committeter Order-Erstellung
 * (createOrder() oder convertOfferToOrder()) — niemals davor, niemals
 * allein aufgrund von Offer.status === 'ACCEPTED'. Erzeugt/verwendet
 * ausschließlich ein internes Project — aktiviert KEINE Zusammenarbeit
 * (siehe ensureActorMembership()/activateProjectCollaborationAction für
 * die bewusste, separate Freigabe).
 *
 * Wirft nie — Fehlschläge werden auditiert und als {status:'failed'}
 * zurückgegeben, damit ein Aufrufer die bereits erfolgreiche Order-Anlage
 * nie rückwirkend als gescheitert melden muss (siehe Datei-Kommentar oben).
 */
export async function ensureProjectForOrder(orderId: string, actor: Actor): Promise<ProjectHandoverResult> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
      select: { id: true, projectId: true, customerId: true, title: true, orderNumber: true },
    })
    if (!order) throw new NotFoundError('Auftrag nicht gefunden')

    const projectId = await createOrReuseProjectForOrder(order, actor)
    return { status: 'linked', projectId }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Project konnte nicht automatisch angelegt/verknüpft werden.'
    // Darf nie unbemerkt bleiben — Audit-Eintrag unabhängig davon, an
    // welcher Stelle der Handover fehlschlug.
    await writeAuditLog({
      userId: actor.userId, userEmail: actor.userEmail, action: 'STATUS_CHANGE',
      entityType: 'business_project_handover', entityId: orderId, metadata: { error: message },
    })
    return { status: 'failed', error: message }
  }
}

// Membership-Erzeugung ist idempotent (Existenzprüfung vor dem Schreiben,
// zusätzlich durch den bestehenden @@unique([userId, projectId])-Constraint
// gegen echte Nebenläufigkeit abgesichert) und verwendet ausschließlich die
// bereits bestehende Rolle COLLAB_MANAGER ("TWIR Projektleitung /
// Management") — keine neue Rolle. Exportiert, damit sowohl diese Datei als
// auch activateProjectCollaborationAction (bewusste manuelle Freigabe)
// dieselbe, einzige Membership-Logik verwenden — keine zweite Erzeugung.
export async function ensureActorMembership(collaborationProjectId: string, actor: Actor): Promise<void> {
  const existing = await prisma.collaborationMembership.findUnique({
    where: { userId_projectId: { userId: actor.userId, projectId: collaborationProjectId } },
  })
  if (existing) return
  try {
    await prisma.collaborationMembership.create({
      data: { userId: actor.userId, projectId: collaborationProjectId, role: CollaborationRole.COLLAB_MANAGER, active: true },
    })
    await writeAuditLog({
      userId: actor.userId, userEmail: actor.userEmail, action: 'CREATE',
      entityType: 'collaboration_membership', entityId: collaborationProjectId,
      newValue: { userId: actor.userId, role: CollaborationRole.COLLAB_MANAGER },
    })
  } catch (error) {
    // Zwei nahezu gleichzeitige Freigabe-/Handover-Versuche haben dieselbe
    // Mitgliedschaft zwischenzeitlich bereits angelegt — kein Fehler,
    // keine Dopplung.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
  }
}
