import { describe, it, expect, beforeEach } from 'vitest'
import { prisma } from './setup'
import { createProject, submitProject, startAdminReview, cancelProject } from '@/modules/projects/service'
import { createScope, approveScope } from '@/modules/scopes/service'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization } from '@/modules/clients/service'

describe('state machine: invalid transitions are rejected', () => {
  let adminId: string
  let orgId: string

  beforeEach(async () => {
    const admin = await upsertUser({ clerkId: 'test_admin', email: 'admin@test.com', role: 'admin' })
    adminId = admin.id
    const org = await createOrganization({ name: 'Test Org' }, adminId)
    orgId = org.id
  })

  it('rejects submitting a project that is not DRAFT', async () => {
    const project = await createProject({ clientId: orgId, title: 'Test', description: 'Desc' }, adminId)
    await submitProject(project.id, adminId)
    await expect(submitProject(project.id, adminId)).rejects.toThrow('Invalid transition')
  })

  it('rejects starting admin review on a DRAFT project', async () => {
    const project = await createProject({ clientId: orgId, title: 'Test', description: 'Desc' }, adminId)
    await expect(startAdminReview(project.id, adminId)).rejects.toThrow('Invalid transition')
  })

  it('rejects cancelling an already-cancelled project', async () => {
    const project = await createProject({ clientId: orgId, title: 'Test', description: 'Desc' }, adminId)
    await cancelProject(project.id, adminId)
    await expect(cancelProject(project.id, adminId)).rejects.toThrow('Invalid transition')
  })

  it('rejects approving a scope not in ADMIN_REVIEW', async () => {
    const project = await createProject({ clientId: orgId, title: 'Test', description: 'Desc' }, adminId)
    const scope = await createScope({
      projectId: project.id,
      deliverable: 'Report',
      acceptanceCriteria: 'Delivered',
      assumptions: 'None',
      exclusions: 'None',
      dueDate: new Date('2026-12-31'),
      fee: 1000,
      effortCapHours: 5,
    }, adminId)
    // scope is AI_DRAFTED — cannot approve directly
    await expect(approveScope(scope.id, adminId)).rejects.toThrow('Invalid transition')
  })
})
