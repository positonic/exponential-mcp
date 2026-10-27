import { z } from 'zod';
import { type Domain, date, id, op, workspaceId } from './framework.js';

const note = z
  .string()
  .optional()
  .describe('Why you made this change — one sentence. Always send it: it is shown in the page history, and a write without one reads "No reason given" to everyone.');
const source = z
  .string()
  .nullable()
  .optional()
  .describe('Provenance: where the facts come from — a URL, a document, a person. Empty/null clears it.');
const asOf = date('Provenance: the date the facts were true').nullable().optional();

export const pages: Domain = {
  name: 'pages',
  description:
    'Knowledge pages: workspace-scoped Markdown documents (strategy, PRDs, research, specs), optionally filed under a project. Reads are Markdown-only (the editor doc is never sent); use `outline` then `get` with `section` on long pages. Every write is recorded in the page history — pass a `note` saying why, and `baseVersion` so you never overwrite a newer edit. Link one to a feature with `features` link_page; page comments are in the `comments` tool.',
  operations: {
    list: op({
      summary:
        'List pages you can view, most recently edited first. Metadata only (no body) — use get for the content, search to find pages by meaning.',
      params: z.object({
        workspaceId,
        projectId: id('Project').optional(),
        search: z.string().optional().describe('Case-insensitive title match; use the search operation for content or meaning'),
      }),
      run: (client, params) => client.pages.list(params),
    }),
    search: op({
      summary:
        'Find pages by meaning: semantic hits from the Knowledge index first (nearest first, with the matching passage as snippet), then pages whose title or body contain the text. Only pages you can view.',
      params: z.object({
        workspaceId,
        query: z.string().min(2).max(200).describe('What the page should be about'),
        projectId: id('Project').optional(),
        limit: z.number().int().min(1).max(25).optional().describe('Max pages (default 10)'),
      }),
      run: (client, params) => client.pages.search(params),
    }),
    get: op({
      summary:
        'Get one page: Markdown body, bodyBytes (size of the whole body) and canEdit. Pass section to read one heading only.',
      params: z.object({
        id: id('Page'),
        section: z
          .string()
          .optional()
          .describe('Only this heading\'s section (case-insensitive; "## " prefix allowed). Unknown headings fail with the list that exists.'),
      }),
      run: (client, { id, section }) => client.pages.get(id, { format: 'markdown', section }),
    }),
    outline: op({
      summary: 'The page\'s headings (level, text, line) and bodyBytes, no body — see a long page\'s shape before reading a section.',
      params: z.object({ id: id('Page') }),
      run: (client, { id }) => client.pages.outline(id),
    }),
    create: op({
      summary: 'Create a page. Title defaults to "Untitled"; a non-empty body is indexed for search. The note lands on its first revision.',
      params: z.object({
        workspaceId,
        projectId: z.string().nullable().optional().describe('Project ID to file it under (null/omit = workspace-level)'),
        title: z.string().optional(),
        body: z.string().optional().describe('Markdown body'),
        includeInSearch: z.boolean().optional().describe('Default true'),
        note,
        source,
        asOf,
      }),
      run: (client, params) => client.pages.create(params),
    }),
    update: op({
      summary:
        'Update a page. Only the fields you pass change; body replaces the whole document (comment anchors are carried across where their text survives). Send baseVersion (the docVersion you read) so a newer edit by someone else fails with CONFLICT instead of being overwritten.',
      params: z.object({
        id: id('Page'),
        title: z.string().optional(),
        projectId: z.string().nullable().optional().describe('Project ID (null to move to workspace-level)'),
        includeInSearch: z.boolean().optional(),
        body: z.string().optional().describe('Markdown body; replaces the existing body entirely'),
        baseVersion: z.number().int().min(0).optional().describe('The docVersion you read before editing'),
        note,
        source,
        asOf,
      }),
      run: (client, params) => client.pages.update(params),
    }),
    history: op({
      summary: 'The page\'s revisions, newest first: who (authorHidden when names are withheld from you; baseline and automated rows have no author and the note says what wrote them), when, kind (baseline/create/editor/markdown/restore), note, provenance and body size. Never the bodies.',
      params: z.object({
        id: id('Page'),
        limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
        cursor: z.string().optional().describe('nextCursor from a previous call'),
      }),
      run: (client, { id, ...options }) => client.pages.history(id, options),
    }),
    revision: op({
      summary: 'One revision with its Markdown body.',
      params: z.object({ id: id('Page'), revisionId: id('Revision') }),
      run: (client, { id, revisionId }) => client.pages.revision(id, revisionId),
    }),
    diff: op({
      summary:
        'What a revision changed: a unified diff of the Markdown with added/removed counts, plus titleChanged and provenanceChanged (source/asOf on both sides). against: "previous" (default — the revision before it), "current" (the page now) or another revision id.',
      params: z.object({
        id: id('Page'),
        revisionId: id('Revision'),
        against: z.string().optional().describe('"previous" (default), "current", or a revision ID'),
      }),
      run: (client, { id, revisionId, against }) => client.pages.diff(id, revisionId, { against }),
    }),
    restore: op({
      summary:
        'Put a revision\'s title and body back as the page\'s current content. A forward write: docVersion bumps and a "restore" revision is recorded, so nothing is lost.',
      params: z.object({
        id: id('Page'),
        revisionId: id('Revision'),
        note,
        baseVersion: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('The newest revision\'s docVersion from history when you decided; a newer save makes this a CONFLICT. Always send it.'),
      }),
      run: (client, { id, revisionId, note, baseVersion }) =>
        client.pages.restore(id, revisionId, { note, baseVersion }),
    }),
  },
};
