import { z } from 'zod';
import { type Domain, date, id, op, workspaceId } from './framework.js';

const probability = z.number().int().min(0).max(100);
const value = z.number().min(0);

export const deals: Domain = {
  name: 'deals',
  description:
    'CRM deals moving through the workspace’s sales pipeline stages, plus the pipeline and its stages. Deals link to people in `contacts` and companies in `organizations`. All operations target the workspace’s default (oldest active) pipeline.',
  operations: {
    pipeline: op({
      summary: 'Get the workspace’s default pipeline with its stages, or null if there is none you can access.',
      params: z.object({ workspaceId }),
      run: (client, { workspaceId }) => client.pipelines.get(workspaceId),
    }),
    stages: op({
      summary: 'List the pipeline’s stages in order, with deal counts. Use a stage ID for create/move.',
      params: z.object({ workspaceId }),
      run: (client, { workspaceId }) => client.pipelines.getStages(workspaceId),
    }),
    list: op({
      summary: 'List every deal in the pipeline (unpaginated), ordered by position within stage.',
      params: z.object({ workspaceId }),
      run: (client, { workspaceId }) => client.pipelines.listDeals(workspaceId),
    }),
    get: op({
      summary: 'Get one deal with its stage, contact, organization, assignee and latest 50 activities.',
      params: z.object({ id: id('Deal') }),
      run: (client, { id }) => client.pipelines.getDeal(id),
    }),
    create: op({
      summary: 'Create a deal at the end of a stage. Logs a CREATED activity.',
      params: z.object({
        workspaceId,
        stageId: id('Pipeline stage'),
        title: z.string(),
        description: z.string().optional(),
        value: value.optional(),
        currency: z.string().optional().describe('ISO currency code; default USD'),
        probability: probability.optional().describe('Win probability, 0–100'),
        expectedCloseDate: date('Expected close date').optional(),
        contactId: id('Contact').optional(),
        organizationId: id('Organization').optional(),
        assignedToId: id('User').optional(),
      }),
      run: (client, params) => client.pipelines.createDeal(params),
    }),
    update: op({
      summary:
        'Update a deal’s fields (not its stage — use move). Only the fields you pass change; a value change is logged as an activity.',
      params: z.object({
        id: id('Deal'),
        title: z.string().optional(),
        description: z.string().nullable().optional().describe('null to clear'),
        value: value.nullable().optional().describe('null to clear'),
        currency: z.string().optional(),
        probability: probability.nullable().optional().describe('Win probability, 0–100 (null to clear)'),
        expectedCloseDate: date('Expected close date').nullable().optional().describe('ISO 8601 date or datetime (null to clear)'),
        contactId: z.string().nullable().optional().describe('Contact ID (null to clear)'),
        organizationId: z.string().nullable().optional().describe('Organization ID (null to clear)'),
        assignedToId: z.string().nullable().optional().describe('User ID (null to clear)'),
      }),
      run: (client, params) => client.pipelines.updateDeal(params),
    }),
    move: op({
      summary:
        'Move a deal to a stage and position. Entering a won/lost stage sets closedAt (leaving one clears it); a stage change is logged. Other deals are not re-ordered.',
      params: z.object({
        id: id('Deal'),
        stageId: id('Target pipeline stage'),
        stageOrder: z.number().int().min(0).describe('0-based position within the target stage'),
      }),
      run: (client, params) => client.pipelines.moveDeal(params),
    }),
    delete: op({
      summary: 'Delete a deal permanently, with its activity history.',
      params: z.object({ id: id('Deal') }),
      run: (client, { id }) => client.pipelines.deleteDeal(id),
    }),
  },
};
