import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import 'dotenv/config'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  // Admin user
  const adminUser = await db.user.upsert({
    where: { email: 'admin@consulten.test' },
    update: {},
    create: { clerkId: 'clerk_admin_seed', email: 'admin@consulten.test', role: 'admin' },
  })

  // Client org + contact user
  const clientUser = await db.user.upsert({
    where: { email: 'client@clearpath.test' },
    update: {},
    create: { clerkId: 'clerk_client_seed', email: 'client@clearpath.test', role: 'client' },
  })
  const org = await db.clientOrganization.upsert({
    where: { id: 'seed-org-1' },
    update: {},
    create: { id: 'seed-org-1', name: 'ClearPath Analytics' },
  })
  const existingContact = await db.clientContact.findUnique({ where: { userId: clientUser.id } })
  if (!existingContact) {
    await db.clientContact.create({
      data: { userId: clientUser.id, organizationId: org.id, name: 'Jordan Lee', email: clientUser.email },
    })
  }

  // Consultant user + profile
  const consultantUser = await db.user.upsert({
    where: { email: 'consultant@consulten.test' },
    update: {},
    create: { clerkId: 'clerk_consultant_seed', email: 'consultant@consulten.test', role: 'consultant' },
  })
  const profile = await (async () => {
    const existing = await db.consultantProfile.findUnique({ where: { userId: consultantUser.id } })
    if (existing) return existing
    return db.consultantProfile.create({
      data: { userId: consultantUser.id, approvalStatus: 'approved', accountStatus: 'active', publicationStatus: 'published' },
    })
  })()

  // Project
  const project = await db.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      clientId: org.id,
      title: 'Market Segmentation',
      description: 'Segment our customer base into 3-5 ICP profiles.',
      status: 'SCOPE_APPROVED',
    },
  })

  // Scope
  const existingScope = await db.scope.findUnique({ where: { projectId: project.id } })
  const scope = existingScope ?? await db.scope.create({
    data: {
      projectId: project.id,
      status: 'CLIENT_CONFIRMED',
      deliverable: 'Segmentation report with 3–5 prioritized customer segments',
      acceptanceCriteria: 'Segments validated against CRM data',
      assumptions: 'Client provides CRM export within 48h',
      exclusions: 'Implementation, persona design',
      dueDate: new Date('2026-01-31'),
      fee: 2400,
      effortCapHours: 8,
    },
  })

  // Shortlist + candidate
  const existingShortlist = await db.shortlist.findUnique({ where: { projectId: project.id } })
  const shortlist = existingShortlist ?? await db.shortlist.create({
    data: { projectId: project.id, status: 'CLIENT_VISIBLE' },
  })

  const existingCandidate = await db.shortlistCandidate.findFirst({
    where: { shortlistId: shortlist.id, consultantId: profile.id },
  })
  const candidate = existingCandidate ?? await db.shortlistCandidate.create({
    data: { shortlistId: shortlist.id, consultantId: profile.id, addedBy: adminUser.id },
  })

  // Invitation
  const existingInvitation = await db.consultantInvitation.findFirst({
    where: { projectId: project.id, consultantId: profile.id },
  })
  const invitation = existingInvitation ?? await db.consultantInvitation.create({
    data: {
      shortlistCandidateId: candidate.id,
      projectId: project.id,
      consultantId: profile.id,
      status: 'ACCEPTED_INTEREST',
      sentAt: new Date(),
    },
  })

  // Proposal
  const existingProposal = await db.proposal.findFirst({ where: { invitationId: invitation.id } })
  if (!existingProposal) {
    await db.proposal.create({
      data: {
        invitationId: invitation.id,
        consultantId: profile.id,
        status: 'SUBMITTED',
        fitStatement: 'I have run 12 similar segmentation projects for SaaS companies.',
        deviations: {},
      },
    })
  }

  // Seed ScopingMatrixRow rows (idempotent — skip if any rows exist)
  const existingRows = await db.scopingMatrixRow.count()
  if (existingRows === 0) {
    await db.scopingMatrixRow.createMany({
      data: [
        {
          specialization: 'Strategy',
          function: 'Competitive Intelligence',
          responsibilityCategory: 'Analysis',
          useCase: 'Map the competitive landscape for a defined market segment',
          requiredInputs: 'Company overview (1–2 pages or deck), target customer definition, list of known competitors (minimum 3), geographic focus',
          deliverablePattern: 'Structured competitor matrix (positioning, pricing tier, key differentiators, strengths/weaknesses), written narrative summary, 2–3 strategic implications for the client',
          acceptanceCriteriaPattern: 'Matrix covers all provided competitors plus any material omissions the consultant identifies; each competitor has a complete row; strategic implications are specific to the client\'s stated position, not generic',
          standardExclusions: 'Primary research (customer interviews, surveys); win/loss interview programs; ongoing monitoring; go-to-market planning; pricing strategy recommendations',
          effortEstimateHours: 8,
          suitability: 'Good fit when the client is pre-launch or early-stage and needs a clear picture of the field before making positioning decisions.',
        },
        {
          specialization: 'Research',
          function: 'Customer Discovery',
          responsibilityCategory: 'Synthesis',
          useCase: 'Synthesize existing customer discovery interviews into actionable insights',
          requiredInputs: 'Raw interview transcripts or detailed notes (minimum 5 interviews), target customer persona description, the 2–3 core questions the discovery was designed to answer',
          deliverablePattern: 'Thematic synthesis document: key themes (with supporting quotes), validated vs. invalidated hypotheses, top 3–5 customer insights, recommended next questions',
          acceptanceCriteriaPattern: 'Every major theme is supported by at least 2 independent data points from separate interviews; hypotheses are explicitly marked validated/invalidated/inconclusive with evidence cited',
          standardExclusions: 'Conducting new interviews; survey design; persona creation from scratch; quantitative research; product recommendations beyond what the data supports',
          effortEstimateHours: 7,
          suitability: 'Good fit when the founder has done discovery but hasn\'t had time to synthesize it properly.',
        },
        {
          specialization: 'Analysis',
          function: 'Financial Modeling',
          responsibilityCategory: 'Evaluation',
          useCase: 'Build a financial model for a new product or business line',
          requiredInputs: 'Current P&L or cost structure, pricing assumptions, projected volume/growth assumptions, list of key drivers',
          deliverablePattern: '3-statement financial model (P&L, cash flow, balance sheet) or simplified P&L + unit economics model; scenario toggles (base/bull/bear)',
          acceptanceCriteriaPattern: 'Model is formula-driven (no hard-coded numbers in calculation cells); assumptions are documented on a separate tab; scenarios produce materially different outputs',
          standardExclusions: 'Tax optimization advice; fundraising deck; investor-ready formatting; external benchmarks unless provided by the client',
          effortEstimateHours: 8,
          suitability: 'Good fit when the client has data but lacks the modeling skill to structure it into a forecast.',
        },
        {
          specialization: 'Operations',
          function: 'Process Design',
          responsibilityCategory: 'Design',
          useCase: 'Document and improve a core operational process',
          requiredInputs: 'Description of current process (written or interview notes), list of known pain points, desired outcome, any existing SOPs or documentation',
          deliverablePattern: 'As-is process map + to-be process map (swimlane or BPMN-lite); gap analysis; top 3 improvement recommendations with effort/impact rating',
          acceptanceCriteriaPattern: 'As-is map accurately reflects the described process (validated by client); to-be map is operationally feasible given the client\'s stated constraints; each recommendation includes a specific next action',
          standardExclusions: 'Software selection or procurement; change management planning; implementation; any cross-functional processes outside the defined scope',
          effortEstimateHours: 7,
          suitability: 'Good fit when the client knows a process is broken but hasn\'t had time to step back and diagram it.',
        },
        {
          specialization: 'Marketing',
          function: 'Positioning & Messaging',
          responsibilityCategory: 'Design',
          useCase: 'Develop a positioning statement and core messaging framework',
          requiredInputs: 'Product/service description, target customer segments (at least 2), current messaging or website copy, top 3 competitors and their positioning',
          deliverablePattern: 'Positioning statement (Geoffrey Moore format or equivalent), messaging hierarchy (headline → value props → proof points) for primary segment, secondary messaging notes for up to 2 additional segments',
          acceptanceCriteriaPattern: 'Positioning statement is specific to the client\'s stated differentiation (not generic); messaging hierarchy flows logically from positioning; each value prop is paired with at least one proof point',
          standardExclusions: 'Creative copywriting or visual design; brand identity work; campaign planning; A/B testing; SEO keyword research',
          effortEstimateHours: 6,
          suitability: 'Good fit when the client is refining go-to-market or preparing for a product launch.',
        },
        {
          specialization: 'Product',
          function: 'Roadmap Planning',
          responsibilityCategory: 'Planning',
          useCase: 'Structure a 90-day product roadmap from a backlog',
          requiredInputs: 'Current backlog or feature list (at least 10 items), product strategy or north-star metric, engineering capacity estimate (rough sprint capacity)',
          deliverablePattern: 'Prioritized 90-day roadmap (themes + epics level, not stories); prioritization rationale for top 5 items; 3–5 items explicitly deferred with reason',
          acceptanceCriteriaPattern: 'Every item in the top tier has a stated rationale tied to the product strategy or a specific metric; deferred items include a specific reason (not just "lower priority"); roadmap fits within stated capacity',
          standardExclusions: 'User story writing; sprint planning; engineering estimates; stakeholder alignment sessions; OKR design',
          effortEstimateHours: 6,
          suitability: 'Good fit when the client has too many ideas and no framework for deciding what to build next.',
        },
        {
          specialization: 'Finance',
          function: 'Fundraising Preparation',
          responsibilityCategory: 'Synthesis',
          useCase: 'Prepare a data room or financial narrative for an investor conversation',
          requiredInputs: 'Historical financials (at least 12 months), current cap table, funding ask and use of funds, target investor profile (seed, Series A, etc.)',
          deliverablePattern: 'Data room checklist with gap analysis (what\'s missing vs. investor expectations); financial narrative memo (2–3 pages): traction story, unit economics, path to profitability',
          acceptanceCriteriaPattern: 'Checklist covers all standard items for the stated funding stage; narrative memo tells a coherent story from current state to use-of-funds to outcome; unit economics are calculated from provided data (not estimated)',
          standardExclusions: 'Investor outreach or introductions; pitch deck design; valuation advice; legal structuring; cap table modeling beyond current state',
          effortEstimateHours: 8,
          suitability: 'Good fit 4–8 weeks before a raise, when the client has traction data but hasn\'t packaged it for investors.',
        },
        {
          specialization: 'Strategy',
          function: 'Go-to-Market',
          responsibilityCategory: 'Planning',
          useCase: 'Define a go-to-market motion for a new product or segment',
          requiredInputs: 'Product description and pricing, target customer segment definition, current sales/marketing capacity, 2–3 reference customers or early deals',
          deliverablePattern: 'GTM brief: ICP definition, channel recommendations (top 2–3 with rationale), outreach sequence outline for primary channel, 60-day action plan',
          acceptanceCriteriaPattern: 'ICP is specific enough to use as a targeting filter (industry + company size + job title + trigger); channel recommendations include a realistic CAC range; action plan has named owners and dates',
          standardExclusions: 'Campaign execution; content creation; CRM setup; paid media buying; sales hire planning',
          effortEstimateHours: 7,
          suitability: 'Good fit when the client has early signal (1–3 customers) and needs to systematize the next phase of growth.',
        },
      ],
    })
    console.log('Seeded 8 ScopingMatrix rows')
  }

  console.log('✅ Seed complete')
  console.log(`  Admin:      ${adminUser.email}`)
  console.log(`  Client:     ${clientUser.email} (${org.name})`)
  console.log(`  Consultant: ${consultantUser.email}`)
  console.log(`  Project:    ${project.title} [${project.status}]`)
  console.log(`  Scope:      ${scope.id} [${scope.status}]`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
