import { z } from 'zod';
import { type Domain, id, op } from './framework.js';

const note = z
  .string()
  .optional()
  .describe('Why you made this change — one sentence. It is recorded on the row page\'s revision; a write without one reads "No reason given".');

const databaseId = id('Database');

const PROPERTY_TYPES = [
  'text',
  'number',
  'select',
  'multiSelect',
  'date',
  'checkbox',
  'url',
  'person',
  'createdTime',
  'lastEditedTime',
  'createdBy',
] as const;

const optionInput = z.object({
  id: z.string().optional().describe('Pass to rename or recolour an existing option; omit for a new one'),
  name: z.string().min(1),
  color: z
    .enum(['gray', 'red', 'pink', 'grape', 'violet', 'indigo', 'blue', 'cyan', 'teal', 'green', 'lime', 'yellow', 'orange'])
    .optional()
    .describe('Palette name; defaults to the next free colour'),
});

const filterInput = z.object({
  propertyId: z.string().describe('Property ID (not name)'),
  op: z.enum(['eq', 'neq', 'contains', 'isEmpty', 'isNotEmpty', 'gt', 'lt', 'before', 'after', 'anyOf']),
  value: z
    .unknown()
    .optional()
    .describe('Checked like a written value: a select by option name or id; anyOf a list; gt/lt a number; before/after an ISO date'),
});

const viewInput = z
  .object({
    sort: z.object({ propertyId: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
    filters: z.array(filterInput).default([]),
    hiddenPropertyIds: z.array(z.string()).default([]),
    propertyOrder: z.array(z.string()).default([]).describe('Column order by property ID; unlisted properties follow in definition order'),
  })
  .describe('A whole view: { sort?, filters, hiddenPropertyIds, propertyOrder }. Every property it names must exist (by ID).');

/**
 * Cell values: the one place agents get this wrong, so the description spells
 * out the typing rules the server enforces.
 */
const values = z
  .record(z.unknown())
  .describe(
    'Cell values keyed by property NAME or ID. Each value is typed by its property and a wrong one is refused naming the property: ' +
      'title/text/url → string; number → number (or numeric string); select → an option NAME or id (not free text — add the option first with update_property); ' +
      'multiSelect → list of option names/ids (or comma-separated string); date → ISO 8601 string; checkbox → boolean or "yes"/"no"; ' +
      'person → user ID or list of them. null clears a cell. The title property\'s value becomes the row page\'s title. ' +
      'createdTime/lastEditedTime/createdBy are read-only; relation values are set in V3.',
  );

export const databases: Domain = {
  name: 'databases',
  description:
    'Databases: typed tables inside pages (ADR-0078). A database is a block in a page body, owned by that page; each row is a page of its own — read its prose and history with the `pages` tool (`get` on the row ID shows its property header). ' +
    'WRITES ARE TYPED: every value is checked against its property\'s type and a bad value is refused with the property named — read the database first (`get`) to learn the property names, types and select options. ' +
    'Reading the holding page with `pages.get` shows the table; use this tool to write, or to read rows as data. ' +
    'Not a work tracker: never put tasks, tickets or projects in a database — those have their own tools.',
  operations: {
    create: op({
      summary:
        'Create a database on a page with a title property, and (by default) place its block at the end of the page body. Then add properties and rows.',
      params: z.object({
        pageId: id('Page').describe('The page that will hold it; you need edit access'),
        name: z.string().min(1).describe('e.g. "Metrics"'),
        place: z
          .boolean()
          .optional()
          .describe('Default true: append the marker line to the page body so the page shows the table. False returns the marker for you to place.'),
        note,
      }),
      run: async (client, { pageId, name, place, note: why }) => {
        const database = await client.databases.create({ pageId, name });
        if (place === false || !database.marker) return { ...database, placed: false };
        const page = await client.pages.get(pageId);
        const body = page.body?.trimEnd();
        await client.pages.update({
          id: pageId,
          body: body ? `${body}\n\n${database.marker}` : database.marker,
          baseVersion: page.docVersion,
          note: why ?? `Add the ${database.name} database`,
        });
        return { ...database, placed: true };
      },
    }),
    get: op({
      summary: 'One database: its properties (names, types, select options with ids), saved view, row count and holding page. Read this before writing rows.',
      params: z.object({ id: databaseId }),
      run: (client, { id }) => client.databases.get(id),
    }),
    list: op({
      summary: 'The databases a page holds, detached ones included (detachedAt set: the block is out of the body; rows wait 30 days for the purge).',
      params: z.object({ pageId: id('Page') }),
      run: (client, { pageId }) => client.databases.list(pageId),
    }),
    update: op({
      summary: 'Rename a database, or replace its saved view WHOLE (send the full view, not a patch).',
      params: z.object({ id: databaseId, name: z.string().min(1).optional(), view: viewInput.optional() }),
      run: (client, params) => client.databases.update(params),
    }),
    delete: op({
      summary: 'Delete a database and every row with it (the rows are pages). Removing the block from the page only detaches; this is the delete.',
      params: z.object({ id: databaseId }),
      run: (client, { id }) => client.databases.delete(id),
    }),

    add_property: op({
      summary: `Add a property (column). Types: ${PROPERTY_TYPES.join(', ')}. title exists from creation; relation arrives with V3. Select options get stable ids.`,
      params: z.object({
        id: databaseId,
        name: z.string().min(1),
        type: z.enum(PROPERTY_TYPES),
        description: z.string().optional(),
        options: z.array(optionInput).optional().describe('select/multiSelect only'),
      }),
      run: (client, params) => client.databases.addProperty(params),
    }),
    update_property: op({
      summary:
        'Rename, retype, describe or re-option a property. Ids stay, no row is rewritten. options replaces the whole list: include existing options with their id to keep them, leave one out to remove it.',
      params: z.object({
        id: databaseId,
        propertyId: z.string().describe('Property ID or its (unique) name'),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional().describe('null clears it'),
        type: z.enum(PROPERTY_TYPES).optional().describe('Not for the title property'),
        options: z.array(optionInput).optional(),
      }),
      run: (client, params) => client.databases.updateProperty(params),
    }),
    remove_property: op({
      summary: 'Remove a property from the schema and view (never the title). Row values under it stay until each row is next written.',
      params: z.object({ id: databaseId, propertyId: z.string().describe('Property ID or name') }),
      run: (client, { id, propertyId }) => client.databases.removeProperty(id, propertyId),
    }),
    reorder_properties: op({
      summary: 'Set the column order; propertyIds must name every property exactly once.',
      params: z.object({ id: databaseId, propertyIds: z.array(z.string()).min(1) }),
      run: (client, { id, propertyIds }) => client.databases.reorderProperties(id, propertyIds),
    }),

    list_rows: op({
      summary:
        'Rows with their typed values (keyed by property ID; select values are option ids — map them with get), through the saved view or a view you pass. Paged: pass nextCursor back as cursor. columns = visible property ids in order.',
      params: z.object({
        id: databaseId,
        view: viewInput.optional(),
        limit: z.number().int().min(1).max(200).optional().describe('Default 50'),
        cursor: z.string().optional(),
      }),
      run: (client, { id, ...options }) => client.databases.listRows(id, options),
    }),
    add_row: op({
      summary: 'Add a row with typed values (see values). It becomes a page placed where the holding page is; the title property is its title.',
      params: z.object({ id: databaseId, values: values.optional(), note }),
      run: (client, { id, values: v, note: why }) => client.databases.createRow(id, v ?? {}, { note: why }),
    }),
    update_row: op({
      summary: 'Write some of a row\'s cells (see values). Cells you do not name are kept; null clears one. Recorded as a revision on the row page.',
      params: z.object({ rowId: id('Row page'), values, note }),
      run: (client, { rowId, values: v, note: why }) => client.databases.updateRow(rowId, v, { note: why }),
    }),
    delete_row: op({
      summary: 'Delete a row: the page and its search chunks.',
      params: z.object({ rowId: id('Row page') }),
      run: (client, { rowId }) => client.databases.deleteRow(rowId),
    }),
  },
};
