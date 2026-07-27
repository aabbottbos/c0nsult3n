import { db } from '@/lib/db'
import { callClaude } from '@/lib/ai'
import { logEvent } from '@/modules/audit-events/service'

export async function listMatrixRows() {
  return db.scopingMatrixRow.findMany({ orderBy: [{ specialization: 'asc' }, { function: 'asc' }] })
}

export async function getClassification(projectId: string) {
  return db.scopingMatrixClassification.findUnique({
    where: { projectId },
    include: { matrixRow: true },
  })
}

export async function classifyManually(
  projectId: string,
  matrixRowId: string,
  actorId: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.scopingMatrixClassification.upsert({
      where: { projectId },
      update: { matrixRowId, adminConfirmed: true, aiRationale: null },
      create: { projectId, matrixRowId, adminConfirmed: true },
    })
    await logEvent(tx, { entityType: 'Project', entityId: projectId, action: 'SCOPING_CLASSIFIED_MANUALLY', actorId, actorRole: 'admin', data: { matrixRowId } })
  })
}

export async function classifyWithAI(
  projectId: string,
  actorId: string,
): Promise<{ matrixRowId: string; aiRationale: string }> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { scope: true },
  })

  const rows = await listMatrixRows()
  const rowList = rows.map(r =>
    `ID: ${r.id}\nSpecialization: ${r.specialization}\nFunction: ${r.function}\nUse Case: ${r.useCase}\nSuitability: ${r.suitability}`
  ).join('\n\n')

  const system = `You are a scoping classification assistant. Given a project description and a list of Scoping Matrix rows, identify the best matching row and explain why. Respond with a JSON object: { "matrixRowId": "<id>", "rationale": "<1-2 sentence explanation>" }`

  const prompt = `Project title: ${project.title}
Project description: ${project.description}
${project.scope ? `Deliverable: ${project.scope.deliverable}` : ''}

Scoping Matrix rows:
${rowList}`

  const raw = await callClaude(system, prompt)
  const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()) as { matrixRowId: string; rationale: string }

  await db.$transaction(async (tx) => {
    await tx.scopingMatrixClassification.upsert({
      where: { projectId },
      update: { matrixRowId: parsed.matrixRowId, aiRationale: parsed.rationale, adminConfirmed: false },
      create: { projectId, matrixRowId: parsed.matrixRowId, aiRationale: parsed.rationale, adminConfirmed: false },
    })
    await logEvent(tx, { entityType: 'Project', entityId: projectId, action: 'SCOPING_CLASSIFIED_AI', actorId, actorRole: 'admin', data: { matrixRowId: parsed.matrixRowId } })
  })

  return { matrixRowId: parsed.matrixRowId, aiRationale: parsed.rationale }
}

export async function confirmClassification(projectId: string, actorId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.scopingMatrixClassification.findUniqueOrThrow({ where: { projectId } })
    await tx.scopingMatrixClassification.update({
      where: { projectId },
      data: { adminConfirmed: true },
    })
    await logEvent(tx, { entityType: 'Project', entityId: projectId, action: 'SCOPING_CLASSIFICATION_CONFIRMED', actorId, actorRole: 'admin', data: { matrixRowId: existing.matrixRowId } })
  })
}
