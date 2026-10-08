import { z } from 'zod';
import { type Domain, date, id, op } from './framework.js';

const TIME_ENTRY_STATUSES = ['PROPOSED', 'CONFIRMED'] as const;
const WRITABLE_SOURCES = ['manual', 'claude-desktop', 'agent-run'] as const;

const day = z
  .string()
  .describe(
    "Calendar day as YYYY-MM-DD (or an ISO timestamp); resolved to local midnight in the MCP server's timezone"
  );
const optionalWorkspaceId = z
  .string()
  .optional()
  .describe('Workspace ID (see the `workspaces` tool); omit for all workspaces');

const entryFields = {
  actionId: id('Action'),
  startedAt: date('Start'),
  endedAt: date('End (must be after startedAt)'),
  source: z
    .enum(WRITABLE_SOURCES)
    .optional()
    .describe('Defaults to manual. claude-desktop = Daily worklog proposed time; agent-run = unattended agent time'),
  status: z
    .enum(TIME_ENTRY_STATUSES)
    .optional()
    .describe('Defaults to CONFIRMED for a human; ignored (always PROPOSED) under an agent key'),
  sourceRef: z
    .string()
    .optional()
    .describe('Idempotency key, e.g. `claude-session:<sessionId>#<segmentIndex>`; makes the write an upsert'),
  note: z.string().max(1000).optional().describe('One line shown in the day view'),
};

const partialEntry = z.object(entryFields).partial();

export const time: Domain = {
  name: 'time',
  description:
    'Time entries logged against actions (the Daily worklog write path). An entry always belongs to the person whose time it was: under an agent key it is owned by the agent’s owner and forced to PROPOSED until they confirm the day. Actions live in the `actions` tool.',
  operations: {
    log: op({
      summary:
        'Log one completed entry with explicit bounds; never touches the running Timer. With sourceRef it upserts per owner (updates a PROPOSED entry, leaves a CONFIRMED one); without, every call creates a row. Outcome: created / updated / left / merged / dropped.',
      params: z.object(entryFields),
      run: (client, params) => client.time.log(params),
    }),
    log_batch: op({
      summary:
        'Log many entries in order, one call each; a failure is reported per entry ({ index, success, error }) instead of failing the batch. `defaults` fill fields an entry omits.',
      params: z.object({
        entries: z.array(partialEntry).describe('Entries; each needs actionId, startedAt, endedAt after defaults apply'),
        defaults: partialEntry.optional(),
      }),
      run: (client, { entries, defaults }) => client.time.logBatch(entries, defaults),
    }),
    confirm_day: op({
      summary:
        'Flip every PROPOSED entry of yours starting on that day to CONFIRMED, moving the actions’ spent time. Human only — agent keys are FORBIDDEN. Returns { confirmed }.',
      params: z.object({ date: day, workspaceId: optionalWorkspaceId }),
      run: (client, { date, workspaceId }) => client.time.confirmDay(date, workspaceId),
    }),
    day_report: op({
      summary:
        'One day’s time as the /time Day tab shows it: entries joined to action/ticket/project/product, attention vs session vs agent-run minutes, per-product and per-action roll-ups. Under an agent key it is the owner’s day.',
      params: z.object({ date: day, workspaceId: optionalWorkspaceId }),
      run: (client, { date, workspaceId }) => client.time.dayReport(date, workspaceId),
    }),
    list: op({
      summary: 'Your raw time entries touching one day, oldest first, each with its status.',
      params: z.object({ date: day, workspaceId: optionalWorkspaceId }),
      run: (client, { date, workspaceId }) => client.time.list(date, workspaceId),
    }),
  },
};
