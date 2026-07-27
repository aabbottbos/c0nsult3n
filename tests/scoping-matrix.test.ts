import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { listMatrixRows, getClassification, classifyManually, confirmClassification } from '@/modules/scoping-matrix/service'

async function seedBase() {
  const adminUser = await prisma.user.create({
    data: { clerkId: 'clerk_admin_sm', email: 'admin_sm@test.com', role: 'admin' },
  })
  const org = await prisma.clientOrganization.create({ data: { name: 'Test Org SM' } })
  const project = await prisma.project.create({
    data: { clientId: org.id, title: 'SM Test Project', description: 'Testing scoping matrix', status: 'UNDER_ADMIN_REVIEW' },
  })
  const matrixRow = await prisma.scopingMatrixRow.create({
    data: {
      specialization: 'Strategy',
      function: 'Competitive Intelligence',
      responsibilityCategory: 'Analysis',
      useCase: 'Map the competitive landscape',
      requiredInputs: 'Company overview',
      deliverablePattern: 'Competitor matrix',
      acceptanceCriteriaPattern: 'Matrix covers all competitors',
      standardExclusions: 'Primary research',
      effortEstimateHours: 8,
      suitability: 'Good fit for pre-launch companies',
    },
  })
  return { adminUser, org, project, matrixRow }
}

describe('scoping matrix', () => {
  it('listMatrixRows returns rows ordered by specialization and function', async () => {
    await prisma.scopingMatrixRow.create({
      data: {
        specialization: 'Zzz',
        function: 'Z Function',
        responsibilityCategory: 'Planning',
        useCase: 'Test use case',
        requiredInputs: 'Nothing',
        deliverablePattern: 'A doc',
        acceptanceCriteriaPattern: 'It exists',
        standardExclusions: 'Everything else',
        effortEstimateHours: 4,
        suitability: 'Always',
      },
    })
    await prisma.scopingMatrixRow.create({
      data: {
        specialization: 'Aaa',
        function: 'A Function',
        responsibilityCategory: 'Analysis',
        useCase: 'Another test',
        requiredInputs: 'Data',
        deliverablePattern: 'Report',
        acceptanceCriteriaPattern: 'It covers all items',
        standardExclusions: 'Implementation',
        effortEstimateHours: 6,
        suitability: 'Good fit',
      },
    })
    const rows = await listMatrixRows()
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows[0].specialization.localeCompare(rows[rows.length - 1].specialization)).toBeLessThanOrEqual(0)
  })

  it('getClassification returns null when no classification exists', async () => {
    const { project } = await seedBase()
    const result = await getClassification(project.id)
    expect(result).toBeNull()
  })

  it('classifyManually creates classification with adminConfirmed=true', async () => {
    const { adminUser, project, matrixRow } = await seedBase()
    await classifyManually(project.id, matrixRow.id, adminUser.id)
    const classification = await getClassification(project.id)
    expect(classification).not.toBeNull()
    expect(classification!.matrixRowId).toBe(matrixRow.id)
    expect(classification!.adminConfirmed).toBe(true)
    expect(classification!.aiRationale).toBeNull()
  })

  it('classifyManually upserts — calling twice does not create duplicate', async () => {
    const { adminUser, project, matrixRow } = await seedBase()
    await classifyManually(project.id, matrixRow.id, adminUser.id)
    await classifyManually(project.id, matrixRow.id, adminUser.id)
    const classifications = await prisma.scopingMatrixClassification.findMany({ where: { projectId: project.id } })
    expect(classifications.length).toBe(1)
  })

  it('confirmClassification sets adminConfirmed=true on existing classification', async () => {
    const { adminUser, project, matrixRow } = await seedBase()
    await prisma.scopingMatrixClassification.create({
      data: { projectId: project.id, matrixRowId: matrixRow.id, aiRationale: 'AI said so', adminConfirmed: false },
    })
    await confirmClassification(project.id, adminUser.id)
    const classification = await getClassification(project.id)
    expect(classification!.adminConfirmed).toBe(true)
  })
})
