import { z } from 'zod';
import { type Domain, op, workspaceId } from './framework.js';

export const workspaces: Domain = {
  name: 'workspaces',
  description:
    'Workspaces the user belongs to, and their members. Most other tools take a workspaceId from here; use list_members to resolve people for mentions and assignment.',
  operations: {
    list: op({
      summary: 'List the workspaces you belong to.',
      params: z.object({}),
      run: (client) => client.workspaces.list(),
    }),
    list_members: op({
      summary:
        'Everyone in a workspace — direct members plus those with access via a linked team. Each row carries `mentionSyntax` to paste into a comment body.',
      params: z.object({ workspaceId }),
      run: (client, { workspaceId }) => client.workspaces.listMembers(workspaceId),
    }),
  },
};
