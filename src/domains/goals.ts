import { z } from 'zod';
import { type Domain, date, id, op, workspaceId } from './framework.js';

const GOAL_STATUSES = ['planned', 'active', 'completed', 'archived', 'on-hold'] as const;
/** `goals.update` rejects `on-hold`; only `set_status` accepts it. */
const WRITABLE_STATUSES = ['planned', 'active', 'completed', 'archived'] as const;

/** Objectives are keyed by integer id, unlike most cuid-keyed entities. */
const goalId = (what = 'Objective (goal)') => z.number().int().describe(`${what} ID — an integer`);
const period = z.string().describe('Free-form OKR period, e.g. "Q3-2026", "H1-2027", "Annual-2026" (see `periods`)');
const clearable = (what: string) => z.string().nullable().optional().describe(`${what} (null to clear)`);

export const goals: Domain = {
  name: 'goals',
  description:
    'Objectives (`Goal`) — the qualitative half of an OKR, keyed by integer id and nestable up to 5 levels. Their measurable key results live in the `key_results` tool; discussion on an objective is in `comments` (target "goal").',
  operations: {
    list: op({
      summary:
        'List objectives with their linked projects. With workspaceId: every member’s; without: only your own.',
      params: z.object({
        workspaceId: workspaceId.optional().describe('Workspace ID for the workspace-wide list; omit for only your own'),
        period: period.optional(),
        status: z.enum(GOAL_STATUSES).optional(),
      }),
      run: (client, params) => client.goals.list(params),
    }),
    tree: op({
      summary:
        'Objectives nested parent → child (up to 5 levels), each with projects and key results. Only roots at top level.',
      params: z.object({
        workspaceId: workspaceId.optional(),
        status: z.enum(GOAL_STATUSES).optional(),
      }),
      run: (client, params) => client.goals.tree(params),
    }),
    get: op({
      summary: 'Get one objective.',
      params: z.object({ id: goalId() }),
      run: (client, { id }) => client.goals.get(id),
    }),
    list_by_project: op({
      summary: 'Objectives linked to a given project.',
      params: z.object({ projectId: id('Project') }),
      run: (client, { projectId }) => client.goals.listByProject(projectId),
    }),
    create: op({
      summary: 'Create an objective, optionally nested under a parent and linked to one project.',
      params: z.object({
        title: z.string(),
        description: z.string().optional(),
        whyThisGoal: z.string().optional(),
        notes: z.string().optional(),
        dueDate: date('Due date').optional(),
        period: period.optional(),
        status: z.enum(WRITABLE_STATUSES).optional(),
        lifeDomainId: z.number().int().optional(),
        projectId: id('Project').optional().describe('Link the objective to one project on creation'),
        outcomeIds: z.array(z.string()).optional(),
        driUserId: id('Directly responsible user').optional(),
        workspaceId: workspaceId.optional(),
        parentGoalId: goalId('Parent objective').optional().describe('Nest under this objective (integer ID). Max nesting depth is 5'),
        icon: z.string().nullable().optional(),
        iconColor: z.string().nullable().optional(),
      }),
      run: (client, params) => client.goals.create(params),
    }),
    update: op({
      summary:
        'Partial update: omitted fields are untouched, null clears. Prefer set_status / set_parent when that is all you change.',
      params: z.object({
        id: goalId(),
        title: z.string().optional(),
        description: clearable('Description'),
        whyThisGoal: clearable('Why this goal'),
        notes: clearable('Notes'),
        dueDate: date('Due date').nullable().optional().describe('Due date, ISO 8601 (null to clear)'),
        period: clearable('Free-form OKR period, e.g. "Q3-2026"'),
        status: z.enum(WRITABLE_STATUSES).optional().describe('"on-hold" is only accepted by set_status'),
        lifeDomainId: z.number().int().nullable().optional(),
        projectId: clearable('Replace the project links with this one project'),
        projectIds: z.array(z.string()).optional().describe('Replace the project links wholesale; [] clears them'),
        outcomeIds: z.array(z.string()).optional(),
        driUserId: clearable('Directly responsible user ID'),
        workspaceId: clearable('Workspace ID'),
        parentGoalId: z.number().int().nullable().optional().describe('Parent objective integer ID (null to detach)'),
        displayOrder: z.number().int().optional(),
        icon: z.string().nullable().optional(),
        iconColor: z.string().nullable().optional(),
      }),
      run: (client, params) => client.goals.update(params),
    }),
    set_status: op({
      summary:
        'Status-only write; the only path that accepts "on-hold". Moving to "completed" also records a workspace milestone.',
      params: z.object({
        id: goalId(),
        status: z.enum(GOAL_STATUSES),
      }),
      run: (client, params) => client.goals.setStatus(params),
    }),
    set_parent: op({
      summary:
        'Re-parent an objective (or detach with null). Writes only parentGoalId; rejects self-parenting, cycles and depth > 5.',
      params: z.object({
        id: goalId(),
        parentGoalId: z.number().int().nullable().describe('New parent objective integer ID, or null to detach'),
      }),
      run: (client, params) => client.goals.setParent(params),
    }),
    delete: op({
      summary:
        'Delete an objective permanently. Its key results are deleted with it; child objectives are detached, not deleted.',
      params: z.object({ id: goalId() }),
      run: (client, { id }) => client.goals.delete(id),
    }),
    periods: op({
      summary: 'The conventional period strings (quarters, halves, annual) for this year and next.',
      params: z.object({}),
      run: (client) => client.goals.periods(),
    }),
    stats: op({
      summary: 'Aggregate objective/key-result counts, status breakdown and average progress.',
      params: z.object({
        workspaceId: workspaceId.optional(),
        period: period.optional(),
      }),
      run: (client, params) => client.goals.stats(params),
    }),
  },
};
