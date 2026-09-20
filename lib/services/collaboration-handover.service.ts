// GGA-Portal Business → Collaboration Handover V1
// Schließt die im Read-only-Audit festgestellte Lücke: bislang entstand ein
// CollaborationProject ausschließlich über den manuellen Button "Neue
// Zusammenarbeit aktivieren" (activateCollaboration()). Diese Datei ruft
// exakt dieselbe, bereits bestehende, bereits idempotente Funktion auf einem
// automatisch (falls nötig) angelegten/wiederverwendeten `Project` auf —
// keine neue Erzeugungslogik, keine neue Prisma-Relation, kein neues Enum.
//
// Kanonischer Trigger (verbindlich entschieden): die erfolgreiche Entstehung
// eines `Order` — nicht bereits `Offer.status === 'ACCEPTED'` allein. Beide
// Order-Entstehungspfade (createOrder() direkt, convertOfferToOrder() aus
// einem angenommenen Angebot) münden in denselben Übergabepunkt hier.
//
// Transaktionsgrenze (siehe Abschlussbericht, Feld "TRANSACTION BOUNDARY"):
// createOrder()/convertOfferToOrder()/createProject()/assignOrderToProject()/
// activateCollaboration() eröffnen JEWEILS ihre eigene prisma.$transaction()
// und nehmen keinen externen Transaction-Client entgegen. Eine einzige
// durchgehende DB-Transaktion über Order-Erstellung UND Handover hinweg ist
// daher ohne Signaturänderung dieser fünf bestehenden, an vielen weiteren
// Stellen verwendeten Funktionen nicht erreichbar — das wäre ein größerer,
// hier explizit nicht angeforderter Service-Umbau. Stattdessen folgt dieser
// Handover demselben, bereits im Code etablierten Muster wie die
// Dokumentenarchivierung (archiveBusinessDocument(), siehe
// AuditAction.ARCHIVE_FAILED/ARCHIVE_RETRIED): ein nicht-blockierender
// Folgeschritt nach der bereits erfolgreich committeten Order-Erstellung,
// der bei Fehlschlag NICHT die gesamte Aktion scheitern lässt, sondern
// (a) niemals eine Exception unbemerkt verschluckt — jeder Fehlschlag wird
// über einen Audit-Log-Eintrag sichtbar dokumentiert, und (b) durch die
// vollständige Idempotenz jedes einzelnen Schritts (Project.projectNumber
// @unique, CollaborationProject.internalProjectId @unique,
// CollaborationMembership @@unique([userId, projectId])) jederzeit gefahrlos
// erneut aufgerufen werden kann, bis er vollständig durchläuft.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { ConflictError, NotFoundError } from '@/lib/auth/permissions'
import { writeAuditLog } from '@/lib/services/audit.service'
import { createProject, assignOrderToProject, activateCollaboration } from '@/lib/services/project.service'
import { CollaborationRole } from '@prisma/client'

// Robustheits-Review T12: kurze, begrenzte Wartezeit, in der ein paralleler
// Handover-Versuch für DENSELBEN Order seine eigene assignOrderToProject()-
// Zuordnung abschließen kann, bevor der verlierende Aufruf endgültig
// aufgibt — kein Polling ohne Obergrenze, keine neue Architektur.
const WINNER_VERIFY_ATTEMPTS = 8
const WINNER_VERIFY_DELAY_MS = 25

type Actor = { userId: string; userEmail: string }

export interface CollaborationHandoverResult {
  status: 'linked' | 'failed'
  projectId?: string
  collaborationProjectId?: string
  error?: string
}

// Abschnitt 3: Project-Grunddaten ausschließlich aus bereits vorhandenen,
// zuverlässigen Order-/Customer-Feldern — Order kennt keinen eigenen
// Standort/Gebäude/Etage/Bereich, diese bleiben deshalb bewusst leer statt
// erfunden (activateCollaboration() kopiert sie ohnehin nur weiter, falls
// später am Project gepflegt).
async function ensureProjectForOrder(
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
    // T12 (Robustheits-Review): createProject() nutzt order.orderNumber als
    // deterministische projectNumber — ein ConflictError hier bedeutet
    // entweder (a) ein paralleler Handover-Versuch für DENSELBEN Order hat
    // soeben gewonnen, oder (b) ein fachlich FREMDES, unabhängig angelegtes
    // Project trägt zufällig dieselbe Nummer. Fall (b) darf NIEMALS
    // automatisch übernommen werden — deshalb wird die Relation zum Order
    // explizit verifiziert, nicht nur der Name abgeglichen.
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

// Abschnitt 5: Membership-Erzeugung ist idempotent (Existenzprüfung vor dem
// Schreiben, zusätzlich durch den bestehenden @@unique([userId, projectId])-
// Constraint gegen echte Nebenläufigkeit abgesichert) und verwendet
// ausschließlich die bereits bestehende Rolle COLLAB_MANAGER ("TWIR
// Projektleitung / Management") — keine neue Rolle.
async function ensureActorMembership(collaborationProjectId: string, actor: Actor): Promise<void> {
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
    // T12: ein paralleler Handover-Versuch hat dieselbe Mitgliedschaft
    // zwischenzeitlich bereits angelegt — kein Fehler, keine Dopplung.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error
  }
}

/**
 * Kanonischer Business → Collaboration Handover (Abschnitt 1-5).
 * Aufzurufen NACH erfolgreicher, bereits committeter Order-Erstellung
 * (createOrder() oder convertOfferToOrder()) — niemals davor, niemals
 * allein aufgrund von Offer.status === 'ACCEPTED'.
 *
 * Wirft nie — Fehlschläge werden auditiert und als {status:'failed'}
 * zurückgegeben, damit ein Aufrufer die bereits erfolgreiche Order-Anlage
 * nie rückwirkend als gescheitert melden muss (siehe Datei-Kommentar oben).
 */
export async function ensureCollaborationForOrder(orderId: string, actor: Actor): Promise<CollaborationHandoverResult> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId, deletedAt: null },
      select: { id: true, projectId: true, customerId: true, title: true, orderNumber: true },
    })
    if (!order) throw new NotFoundError('Auftrag nicht gefunden')

    const projectId = await ensureProjectForOrder(order, actor)
    // Abschnitt 4: bestehende, bereits idempotente Funktion — gibt das
    // vorhandene CollaborationProject zurück, falls bereits eines verknüpft
    // ist (Order.CANCELLED bleibt unverändert, Abschnitt 7: kein Guard hier,
    // activateCollaboration() prüft nur den Project-Status, nicht den
    // Order-Status, siehe Abschlussbericht "ORDER CANCELLATION").
    const collaboration = await activateCollaboration(projectId, actor)
    await ensureActorMembership(collaboration.id, actor)

    return { status: 'linked', projectId, collaborationProjectId: collaboration.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Zusammenarbeit konnte nicht automatisch aktiviert werden.'
    // Abschnitt 9: darf nie unbemerkt bleiben — Audit-Eintrag unabhängig
    // davon, an welcher Stelle der Handover fehlschlug.
    await writeAuditLog({
      userId: actor.userId, userEmail: actor.userEmail, action: 'STATUS_CHANGE',
      entityType: 'collaboration_handover', entityId: orderId, metadata: { error: message },
    })
    return { status: 'failed', error: message }
  }
}
