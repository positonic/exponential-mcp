import { z } from 'zod';
import { type Domain, id, op, workspaceId } from './framework.js';

const productFields = {
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
};

export const products: Domain = {
  name: 'products',
  description:
    'Products: the container under a workspace that owns features (`features`), tickets (`tickets`), product epics (`epics`) and research. Most product-side tools need a product ID — find it here by slug or ID.',
  operations: {
    list: op({
      summary: 'List the products in a workspace.',
      params: z.object({ workspaceId }),
      run: (client, { workspaceId }) => client.products.list(workspaceId),
    }),
    get: op({
      summary:
        'Get one product by ID, or by slug when workspaceId is given (a slug-or-ID with workspaceId tries the ID first, then the slug).',
      params: z.object({
        slugOrId: z.string().describe('Product ID, or its URL slug (slug requires workspaceId)'),
        workspaceId: workspaceId.optional().describe('Required to look up by slug'),
      }),
      run: (client, { slugOrId, workspaceId }) =>
        workspaceId ? client.products.resolve(workspaceId, slugOrId) : client.products.get(slugOrId),
    }),
    create: op({
      summary: 'Create a product in a workspace. The slug must be unique within the workspace.',
      params: z.object({
        workspaceId,
        name: z.string(),
        slug: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .describe('Kebab-case URL slug (a–z, 0–9, hyphens)'),
        ...productFields,
      }),
      run: (client, params) => client.products.create(params),
    }),
    update: op({
      summary: 'Update a product. Only the fields you pass change.',
      params: z.object({
        id: id('Product'),
        name: z.string().optional(),
        ...productFields,
        funTicketIds: z
          .boolean()
          .optional()
          .describe('Give new tickets word-pair shortIds (e.g. "prime.toucan") instead of plain numbers'),
      }),
      run: (client, params) => client.products.update(params),
    }),
    delete: op({
      summary:
        'Delete a product permanently. Cascades: all its features, tickets, research, insights and product-bound epics are deleted too. Cycles and retrospectives survive, unlinked.',
      params: z.object({ id: id('Product') }),
      run: (client, { id }) => client.products.delete(id),
    }),
  },
};
