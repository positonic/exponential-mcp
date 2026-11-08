import { z } from 'zod';
import { type Domain, id, op, workspaceId } from './framework.js';

const title = z.string().trim().min(1).max(80).describe('Title, 1–80 characters, unique in the workspace');
const remit = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .describe('Markdown, 1–2000 characters: the kinds of work its holders take on');
const notAccountableFor = z.string().trim().max(2000).describe('Markdown, up to 2000 characters');
const holderUserIds = z
  .array(z.string())
  .max(50)
  .describe('User IDs of workspace members (see `workspaces` list_members)');
const positionId = id('Position');

export const positions: Domain = {
  name: 'positions',
  description:
    "A workspace's roles & responsibilities (Positions): what each role takes on (remit), what it is not accountable for, and who holds it — humans and agents alike. Shown on the workspace settings page. Routing data only; it never grants access. Every write needs the user's own API key (agent keys are refused) and owner/admin, except that a holder who is at least a member may edit their Position's remit. Resolve holders with `workspaces` list_members.",
  operations: {
    list: op({
      summary:
        'Every Position with its holders, plus one row per member: { positions, members: [{ userId, positionIds, remitGap }] }. remitGap = no stated remit.',
      params: z.object({ workspaceId }),
      run: (client, { workspaceId }) => client.positions.list(workspaceId),
    }),
    coverage: op({
      summary: 'How many members have a stated remit, and whether to offer an import.',
      params: z.object({ workspaceId }),
      run: (client, { workspaceId }) => client.positions.coverage(workspaceId),
    }),
    create: op({
      summary: 'Create a Position (owner/admin). A duplicate title is CONFLICT.',
      params: z.object({
        workspaceId,
        title,
        remit,
        notAccountableFor: notAccountableFor.optional(),
        holderUserIds: holderUserIds.optional(),
      }),
      run: (client, params) => client.positions.create(params),
    }),
    update: op({
      summary:
        'Edit a Position. Pass at least one field. holderUserIds REPLACES the holder set; notAccountableFor null or "" clears it.',
      params: z.object({
        workspaceId,
        positionId,
        title: title.optional(),
        remit: remit.optional(),
        notAccountableFor: notAccountableFor.nullable().optional(),
        holderUserIds: holderUserIds.optional(),
      }),
      run: (client, params) => client.positions.update(params),
    }),
    set_holders: op({
      summary: 'Replace who holds a Position (owner/admin). An empty list leaves it unheld.',
      params: z.object({ workspaceId, positionId, userIds: holderUserIds }),
      run: (client, { workspaceId, positionId, userIds }) =>
        client.positions.setHolders(workspaceId, positionId, userIds),
    }),
    delete: op({
      summary: 'Delete a Position (owner/admin). Its holdings go with it.',
      params: z.object({ workspaceId, positionId }),
      run: (client, { workspaceId, positionId }) => client.positions.delete(workspaceId, positionId),
    }),
    import_many: op({
      summary:
        'Upsert 1–50 Positions by title (case-insensitive; never renames), all or nothing (owner/admin). An update replaces the remit, keeps notAccountableFor when omitted ("" clears), and only ADDS holders. Run dryRun: true first and show the plan.',
      params: z.object({
        workspaceId,
        dryRun: z.boolean().describe('true = validate and return the plan without writing'),
        positions: z
          .array(
            z.object({
              title,
              remit,
              notAccountableFor: notAccountableFor.optional(),
              holderUserIds,
            })
          )
          .min(1)
          .max(50),
      }),
      run: (client, params) => client.positions.importMany(params),
    }),
  },
};
