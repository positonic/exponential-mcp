import { z } from 'zod';
import { type Domain, date, id, op } from './framework.js';

const KANBAN_STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'] as const;

const ACTION_STATUSES = ['ACTIVE', 'COMPLETED', 'CANCELLED', 'DELETED', 'DRAFT'] as const;

const PRIORITIES = [
  'Quick',
  'Scheduled',
  '1st Priority',
  '2nd Priority',
  '3rd Priority',
  '4th Priority',
  '5th Priority',
  'Errand',
  'Remember',
  'Watch',
  'Someday Maybe',
] as const;

const optionalWorkspaceId = z
  .string()
  .optional()
  .describe('Workspace ID (see the `workspaces` tool); omit for all workspaces');

const clearableDate = (what: string) => date(what).nullable().optional().describe(`${what} (ISO 8601; null to clear)`);

export const actions: Domain = {
  name: 'actions',
  description:
    'Actions: the personal and project to-dos on the user’s plate, with due/scheduled dates, priority and a kanban column. Projects live in the `projects` tool, logged time in `time`, and meetings (which can spawn actions) in `meetings`.',
  operations: {
    list: op({
      summary:
        'List your open actions (completed/cancelled hidden unless `status` is set). With projectId, returns that project’s actions and ignores `status`; with status alone, returns only actions you created in that kanban column.',
      params: z.object({
        projectId: id('Project').optional(),
        status: z.enum(KANBAN_STATUSES).optional().describe('Kanban column to filter by'),
        assigneeId: id('User').optional(),
      }),
      run: (client, params) => client.actions.list(params),
    }),
    get_today: op({
      summary:
        'What is actually on the user’s plate today, split into overdue / today / inbox — the /today page’s own partition. Prefer this for "what should I do today". Each group is capped at 50 rows; `count` is the true total.',
      params: z.object({ workspaceId: optionalWorkspaceId }),
      run: (client, { workspaceId }) => client.actions.getTodaysActions(workspaceId),
    }),
    get_due_today: op({
      summary:
        'Narrow slice: only actions whose dueDate is today. Excludes overdue and scheduled-but-undated work — use get_today for "what is on my plate".',
      params: z.object({ workspaceId: optionalWorkspaceId }),
      run: (client, { workspaceId }) => client.actions.getToday(workspaceId),
    }),
    get_overdue_triage: op({
      summary:
        'Explain the overdue pile: cohorts (actions sharing one exact timestamp, i.e. a bulk-dated plan — usually bulk_defer them) vs loose, individually-dated debt.',
      params: z.object({ workspaceId: optionalWorkspaceId }),
      run: (client, { workspaceId }) => client.actions.getOverdueTriage(workspaceId),
    }),
    bulk_reschedule: op({
      summary:
        'Move actions to a new date: sets both scheduledStart and dueDate to `dueDate`. Pass null to clear both (bulk_defer says that more clearly). Actions you cannot access are silently skipped.',
      params: z.object({
        actionIds: z.array(id('Action')),
        dueDate: date('New date').nullable().describe('New do/due date (ISO 8601), or null to clear'),
      }),
      run: (client, { actionIds, dueDate }) => client.actions.bulkReschedule(actionIds, dueDate),
    }),
    bulk_defer: op({
      summary:
        'Amnesty: clear the dates on actions so they fall back to their project backlog untimed (1–200 ids). Kanban column is untouched. For work that was never really due — typically an overdue cohort.',
      params: z.object({
        actionIds: z.array(id('Action')).min(1).max(200),
      }),
      run: (client, { actionIds }) => client.actions.bulkDefer(actionIds),
    }),
    list_by_date_range: op({
      summary:
        'Your ACTIVE actions whose dueDate falls in [start, end) — end is exclusive. The workspace filter matches via the action’s project, so project-less actions drop out when it is set.',
      params: z.object({
        start: date('Range start (inclusive)'),
        end: date('Range end (exclusive)'),
        workspaceId: optionalWorkspaceId,
      }),
      run: (client, { start, end, workspaceId }) => client.actions.getByDateRange(start, end, workspaceId),
    }),
    list_kanban: op({
      summary:
        'Kanban-board actions (those with a kanban column), ordered by column then board order. Only returns actions you created.',
      params: z.object({
        projectId: id('Project').optional(),
        status: z.enum(KANBAN_STATUSES).optional().describe('Kanban column to filter by'),
        assigneeId: id('User').optional(),
      }),
      run: (client, params) => client.actions.getKanban(params),
    }),
    list_project_actions: op({
      summary:
        'All actions in one project, including completed ones (unlike list). FORBIDDEN if you lack project access.',
      params: z.object({
        projectId: id('Project'),
        assigneeId: id('User').optional(),
      }),
      run: (client, { projectId, assigneeId }) => client.actions.getProjectActions(projectId, assigneeId),
    }),
    create: op({
      summary: 'Create an action. Priority defaults to "Quick" and status to ACTIVE.',
      params: z.object({
        name: z.string(),
        description: z.string().optional(),
        projectId: id('Project').optional(),
        workspaceId: optionalWorkspaceId.describe('Workspace ID (see the `workspaces` tool)'),
        dueDate: date('Due date').optional(),
        scheduledStart: date('Scheduled start (do-date)').optional(),
        scheduledEnd: date('Scheduled end').optional(),
        duration: z.number().optional().describe('Planned duration in minutes'),
        priority: z.enum(PRIORITIES).optional(),
        status: z.enum(ACTION_STATUSES).optional(),
        epicId: id('Epic').optional(),
        effortEstimate: z.number().optional(),
        blockedByIds: z.array(id('Action')).optional().describe('IDs of actions this one is blocked by'),
      }),
      run: (client, params) => client.actions.create(params),
    }),
    update: op({
      summary:
        'Update an action. Only the fields you pass change. Complete it with status COMPLETED or kanbanStatus DONE.',
      params: z.object({
        id: id('Action'),
        name: z.string().optional(),
        description: z.string().optional(),
        projectId: id('Project').optional().describe('Project ID to move the action to'),
        workspaceId: z.string().nullable().optional().describe('Workspace ID (null to clear)'),
        dueDate: clearableDate('Due date'),
        scheduledStart: clearableDate('Scheduled start (do-date)'),
        scheduledEnd: clearableDate('Scheduled end'),
        duration: z.number().nullable().optional().describe('Planned duration in minutes (null to clear)'),
        priority: z.enum(PRIORITIES).optional(),
        status: z.enum(ACTION_STATUSES).optional(),
        kanbanStatus: z.enum(KANBAN_STATUSES).optional(),
        epicId: z.string().nullable().optional().describe('Epic ID (null to unlink)'),
        effortEstimate: z.number().nullable().optional().describe('Effort estimate (null to clear)'),
        blockedByIds: z
          .array(id('Action'))
          .optional()
          .describe('Replaces the full set of blocking action IDs; omit to leave untouched'),
      }),
      run: (client, params) => client.actions.update(params),
    }),
    upsert_by_source: op({
      summary:
        'Idempotent create keyed on (workspaceId, sourceType, sourceId): refreshes name/links if found, else creates. Returns { action, outcome: "created" | "updated" }.',
      params: z.object({
        sourceType: z.string().describe('External source kind, e.g. `claude-session` for the Daily worklog'),
        sourceId: z.string().describe('External id within sourceType (e.g. the conversation id)'),
        name: z.string(),
        workspaceId: z.string().describe('Workspace ID (see the `workspaces` tool)'),
        description: z.string().optional(),
        projectId: z
          .string()
          .nullable()
          .optional()
          .describe('Project ID; must be in workspaceId or the call is NOT_FOUND'),
        ticketId: z
          .string()
          .nullable()
          .optional()
          .describe('Ticket ID; its product must be in workspaceId or the call is NOT_FOUND'),
      }),
      run: (client, params) => client.actions.upsertBySource(params),
    }),
  },
};
