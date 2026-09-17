import { z } from 'zod'

const optionalText = z.string().trim().max(240).optional().nullable()

export const ProjectInputSchema = z.object({
  projectNumber: z.string().trim().min(1, 'Projektnummer ist erforderlich').max(80),
  name: z.string().trim().min(1, 'Projektname ist erforderlich').max(240),
  description: z.string().trim().max(5000).optional().nullable(),
  customerId: z.string().uuid(),
  leadUserId: z.string().uuid().optional().nullable(),
  status: z.enum(['DRAFT', 'PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).default('DRAFT'),
  location: optionalText, building: optionalText, floor: optionalText, area: optionalText,
  plannedStart: z.coerce.date().optional().nullable(), plannedEnd: z.coerce.date().optional().nullable(),
  actualStart: z.coerce.date().optional().nullable(), actualEnd: z.coerce.date().optional().nullable(),
})

export const ProjectParticipantInputSchema = z.object({ userId: z.string().uuid(), role: z.enum(['PROJECT_LEAD', 'PROJECT_MEMBER', 'OBSERVER']) })
