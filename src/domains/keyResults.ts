import { z } from 'zod';
import { type Domain, id, op, workspaceId } from './framework.js';

const KR_STATUSES = ['not-started', 'on-track', 'at-risk', 'off-track', 'achieved'] as const;
const KR_UNITS = ['percent', 'count', 'currency', 'hours', 'custom'] as const;

/** Key results are cuid-keyed; the objective they hang off is an integer. */
const keyResultId = id('Key result');
const goalId = z.number().int().describe('Objective (goal) ID — an integer, unlike the key result’s own cuid');
const period = z.string().describe('Free-form OKR period, e.g. "Q3-2026" (see `goals` periods)');

export const keyResults: Domain = {
  name: 'key_results',
  description:
    'Key results — the measurable half of an OKR, each hanging off one objective. Objectives themselves are in the `goals` tool; key results can be linked to projects and features as the work that moves them.',
  operations: {
    list: op({
      summary:
        'List key results. With workspaceId: every member’s (older servers may return only yours — prefer by_objective); without: only your own.',
      params: z.object({
        workspaceId: workspaceId.optional(),
        goalId: goalId.optional(),
        period: period.optional(),
        status: z.enum(KR_STATUSES).optional(),
        onlyMine: z.boolean().optional().describe('Narrow a workspace-scoped list back to key results you own'),
      }),
      run: (client, params) => client.keyResults.list(params),
    }),
    by_objective: op({
      summary:
        'Objectives with their key results nested and progress/status counts — the richest OKR read; workspace-correct on every server.',
      params: z.object({
        workspaceId: workspaceId.optional(),
        period: period.optional(),
        includePairedPeriod: z
          .boolean()
          .optional()
          .describe('Also include the period’s parent annual period (Q3-2026 → Annual-2026)'),
        onlyMine: z.boolean().optional(),
      }),
      run: (client, params) => client.keyResults.byObjective(params),
    }),
    get: op({
      summary: 'Get one key result with its check-ins and linked projects/features.',
      params: z.object({ id: keyResultId }),
      run: (client, { id }) => client.keyResults.get(id),
    }),
    create: op({
      summary: 'Create a key result on an objective. Omit workspaceId to inherit the objective’s workspace.',
      params: z.object({
        goalId,
        title: z.string(),
        targetValue: z.number(),
        period,
        description: z.string().optional(),
        startValue: z.number().optional(),
        currentValue: z.number().optional(),
        unit: z.enum(KR_UNITS).optional(),
        unitLabel: z.string().optional().describe('Display label for the unit, e.g. "users" or "€"'),
        driUserId: id('Directly responsible user').optional(),
        workspaceId: workspaceId.optional(),
      }),
      run: (client, params) => client.keyResults.create(params),
    }),
    update: op({
      summary: 'Update a key result. Only the fields you pass change. Use check_in to record progress with history.',
      params: z.object({
        id: keyResultId,
        title: z.string().optional(),
        description: z.string().optional(),
        targetValue: z.number().optional(),
        currentValue: z.number().optional(),
        startValue: z.number().optional(),
        unit: z.enum(KR_UNITS).optional(),
        unitLabel: z.string().optional(),
        status: z.enum(KR_STATUSES).optional(),
        confidence: z.number().min(0).max(100).optional().describe('0–100'),
        driUserId: id('Directly responsible user').optional(),
        goalId: goalId.optional().describe('Move the key result to a different objective (integer ID)'),
      }),
      run: (client, params) => client.keyResults.update(params),
    }),
    check_in: op({
      summary:
        'Record a progress check-in. The server re-derives status from where value lands between start and target.',
      params: z.object({
        id: keyResultId,
        value: z.number().describe('The new current value'),
        note: z.string().optional(),
      }),
      run: (client, params) => client.keyResults.checkIn(params),
    }),
    delete: op({
      summary: 'Delete a key result permanently.',
      params: z.object({ id: keyResultId }),
      run: (client, { id }) => client.keyResults.delete(id),
    }),
    link_project: op({
      summary: 'Link a project to a key result as executing work. Idempotent.',
      params: z.object({ keyResultId, projectId: id('Project') }),
      run: (client, params) => client.keyResults.linkProject(params),
    }),
    unlink_project: op({
      summary: 'Remove a project link from a key result.',
      params: z.object({ keyResultId, projectId: id('Project') }),
      run: (client, params) => client.keyResults.unlinkProject(params),
    }),
    link_feature: op({
      summary:
        'Link a feature as executing work. Idempotent; feature must be in the same workspace. An unaligned feature inherits the objective.',
      params: z.object({ keyResultId, featureId: id('Feature') }),
      run: (client, params) => client.keyResults.linkFeature(params),
    }),
    unlink_feature: op({
      summary: 'Remove a feature link. Removes only the link row — never the feature’s objective alignment.',
      params: z.object({ keyResultId, featureId: id('Feature') }),
      run: (client, params) => client.keyResults.unlinkFeature(params),
    }),
  },
};
