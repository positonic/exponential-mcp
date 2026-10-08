import { z } from 'zod';
import { type Domain, date, id, op } from './framework.js';

const clearableDate = (what: string) => date(what).nullable().optional().describe(`${what} (ISO 8601; null to clear)`);

export const projects: Domain = {
  name: 'projects',
  description:
    'Projects: containers of actions, optionally linked to a product, objectives (goals) and key results. Their actions are in the `actions` tool; workspaces in `workspaces`.',
  operations: {
    list: op({
      summary: 'List projects you can see. Carries no OKR links — use get for those.',
      params: z.object({
        workspaceId: z
          .string()
          .optional()
          .describe('Workspace ID (see the `workspaces` tool); omit for all workspaces'),
        includeActions: z.boolean().optional(),
      }),
      run: (client, params) => client.projects.list(params),
    }),
    get: op({
      summary:
        'Get one project with its actions, linked objectives and key results, DRI and team — the only way to see what a project is driving.',
      params: z.object({
        id: z.string().describe('Project cuid, slug, or the `slug-cuid` form from app URLs'),
      }),
      run: (client, { id }) => client.projects.get(id),
    }),
    update: op({
      summary:
        'Update a project. Only the fields you pass change (omitted name/status/priority cost one extra read).',
      params: z.object({
        id: id('Project'),
        name: z.string().optional(),
        description: z.string().optional().describe("Pass '' to blank it; there is no null-to-clear"),
        status: z.enum(['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']).optional(),
        priority: z.enum(['HIGH', 'MEDIUM', 'LOW', 'NONE']).optional(),
        productId: z.string().nullable().optional().describe('Product ID (null to unlink)'),
        workspaceId: z.string().nullable().optional().describe('Workspace ID (null makes the project personal)'),
        driId: z.string().nullable().optional().describe('User ID of the directly responsible individual (null to clear)'),
        goalIds: z
          .array(z.string())
          .optional()
          .describe('Replace objective links; integer goal ids as strings. [] is a no-op, not a clear'),
        outcomeIds: z.array(z.string()).optional(),
        keyResultIds: z.array(z.string()).optional().describe('Replace key-result links wholesale; [] clears them'),
        lifeDomainIds: z.array(z.number().int()).optional(),
        reviewDate: clearableDate('Review date'),
        nextActionDate: clearableDate('Next action date'),
        startDate: clearableDate('Start date'),
        endDate: clearableDate('End date'),
      }),
      run: (client, params) => client.projects.update(params),
    }),
    delete: op({
      summary: 'Delete a project AND all its actions. No undo.',
      params: z.object({ id: id('Project') }),
      run: (client, { id }) => client.projects.delete(id),
    }),
  },
};
