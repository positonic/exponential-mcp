import { z } from 'zod';
import { type Domain, id, op, workspaceId } from './framework.js';

export const pages: Domain = {
  name: 'pages',
  description:
    'Knowledge pages: workspace-scoped Markdown documents (PRDs, research, technical specs), optionally filed under a project. Link one to a feature with `features` link_page; page comments are in the `comments` tool.',
  operations: {
    list: op({
      summary:
        'List pages you can view, most recently edited first. Returns metadata only (no body) — use get for the content.',
      params: z.object({
        workspaceId,
        projectId: id('Project').optional(),
        search: z.string().optional().describe('Case-insensitive match on title only'),
      }),
      run: (client, params) => client.pages.list(params),
    }),
    get: op({
      summary: 'Get one page with its Markdown body and whether you can edit it (canEdit).',
      params: z.object({ id: id('Page') }),
      run: (client, { id }) => client.pages.get(id),
    }),
    create: op({
      summary: 'Create a page. Title defaults to "Untitled"; a non-empty body is indexed for search.',
      params: z.object({
        workspaceId,
        projectId: z.string().nullable().optional().describe('Project ID to file it under (null/omit = workspace-level)'),
        title: z.string().optional(),
        body: z.string().optional().describe('Markdown body'),
        includeInSearch: z.boolean().optional().describe('Default true'),
      }),
      run: (client, params) => client.pages.create(params),
    }),
    update: op({
      summary:
        'Update a page. Only the fields you pass change; body replaces the whole document (comment anchors are carried across where their text survives).',
      params: z.object({
        id: id('Page'),
        title: z.string().optional(),
        projectId: z.string().nullable().optional().describe('Project ID (null to move to workspace-level)'),
        includeInSearch: z.boolean().optional(),
        body: z.string().optional().describe('Markdown body; replaces the existing body entirely'),
      }),
      run: (client, params) => client.pages.update(params),
    }),
  },
};
