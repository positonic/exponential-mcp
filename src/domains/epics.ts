import { z } from 'zod';
import { type Domain, date, id, op, workspaceId } from './framework.js';

const EPIC_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
const EPIC_PRIORITIES = ['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const;

export const epics: Domain = {
  name: 'epics',
  description:
    'Epics: large bodies of work in a workspace that group tickets (`tickets`) and actions (`actions`). Each new epic belongs to a product (`products`); older ones may have none.',
  operations: {
    list: op({
      summary: 'List the epics in a workspace (all products), ordered by status then name.',
      params: z.object({
        workspaceId,
        status: z.enum(EPIC_STATUSES).optional(),
      }),
      run: (client, params) => client.epics.list(params),
    }),
    get: op({
      summary: 'Get one epic with its owner, tickets and actions.',
      params: z.object({ id: id('Epic') }),
      run: (client, { id }) => client.epics.get(id),
    }),
    create: op({
      summary: 'Create an epic owned by you. Priority defaults to MEDIUM.',
      params: z.object({
        workspaceId,
        productId: id('Product').describe('Product ID; must be in the same workspace'),
        name: z.string().min(1),
        description: z.string().optional(),
        priority: z.enum(EPIC_PRIORITIES).optional(),
        startDate: date('Start date').optional(),
        targetDate: date('Target date').optional(),
      }),
      run: (client, params) => client.epics.create(params),
    }),
    update: op({
      summary: 'Update an epic. Only the fields you pass change.',
      params: z.object({
        id: id('Epic'),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional().describe('null to clear'),
        status: z.enum(EPIC_STATUSES).optional(),
        priority: z.enum(EPIC_PRIORITIES).optional(),
        startDate: date('Start date').nullable().optional().describe('ISO 8601 date or datetime; null to clear'),
        targetDate: date('Target date').nullable().optional().describe('ISO 8601 date or datetime; null to clear'),
      }),
      run: (client, params) => client.epics.update(params),
    }),
    delete: op({
      summary:
        'Delete an epic permanently (only its owner or a workspace owner/admin may). Its tickets and actions are kept but unlinked.',
      params: z.object({ id: id('Epic') }),
      run: (client, { id }) => client.epics.delete(id),
    }),
  },
};
