import { db } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'

export async function createOrganization(data: { name: string }, actorId: string) {
  return db.$transaction(async (tx) => {
    const org = await tx.clientOrganization.create({ data: { name: data.name } })
    await logEvent(tx, { entityType: 'ClientOrganization', entityId: org.id, action: 'create', actorId, actorRole: 'admin' })
    return org
  })
}

export async function createContact(
  data: { userId: string; organizationId: string; name: string; email: string },
  actorId: string
) {
  return db.$transaction(async (tx) => {
    const contact = await tx.clientContact.create({ data })
    await logEvent(tx, { entityType: 'ClientContact', entityId: contact.id, action: 'create', actorId, actorRole: 'admin' })
    return contact
  })
}

export async function listOrganizations() {
  return db.clientOrganization.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function getOrganization(id: string) {
  return db.clientOrganization.findUnique({ where: { id }, include: { contacts: true, projects: true } })
}
