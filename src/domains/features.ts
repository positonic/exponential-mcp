import { z } from 'zod';
import { type Domain, id, op } from './framework.js';

const FEATURE_STATUSES = [
  'IDEA',
  'DEFINED',
  'IN_PROGRESS',
  'SHIPPED',
  'DEPRECATED',
  'ARCHIVED',
] as const;

const priority = z.number().int().min(0).max(4).optional().describe('0–4; lower is higher priority');
const goalId = z.number().int().describe('Objective (goal) ID — an integer, unlike most IDs');

export const features: Domain = {
  name: 'features',
  description:
    'Product features: long-lived capabilities of a product (see `products`), filed under an area (`areas`). A feature’s shippable increments are in `scopes`, its "shall" statements in `requirements`, and its spec documents are Knowledge pages (`pages`) linked here.',
  operations: {
    list: op({
      summary:
        'List a product’s features, newest first, with goal, area, lean key-result links and scope/requirement/ticket counts.',
      params: z.object({
        productId: id('Product'),
        status: z.enum(FEATURE_STATUSES).optional(),
      }),
      run: (client, params) => client.features.list(params),
    }),
    get: op({
      summary: 'Get one feature with its scopes, requirements and key-result progress.',
      params: z.object({ id: id('Feature') }),
      run: (client, { id }) => client.features.get(id),
    }),
    create: op({
      summary: 'Create a feature in a product. Status defaults to IDEA.',
      params: z.object({
        productId: id('Product'),
        name: z.string(),
        description: z.string().optional().describe('Markdown PRD body'),
        vision: z.string().optional(),
        status: z.enum(FEATURE_STATUSES).optional(),
        effort: z.number().optional(),
        priority,
        goalId: goalId.optional(),
        areaId: id('Area').optional().describe('Area ID; must belong to the same product'),
      }),
      run: (client, params) => client.features.create(params),
    }),
    update: op({
      summary:
        'Update a feature. Only the fields you pass change; a feature that was ever live cannot be ARCHIVED (deprecate it instead).',
      params: z.object({
        id: id('Feature'),
        name: z.string().optional(),
        description: z
          .string()
          .optional()
          .describe('Markdown PRD body; replaces the whole body (the rich doc is re-derived server-side)'),
        vision: z.string().optional(),
        status: z.enum(FEATURE_STATUSES).optional(),
        effort: z.number().optional(),
        priority,
        goalId: goalId.nullable().optional().describe('Objective (goal) ID, an integer (null to clear)'),
        areaId: z.string().nullable().optional().describe('Area ID (null to clear)'),
      }),
      run: (client, params) => client.features.update(params),
    }),
    delete: op({
      summary:
        'Delete a feature permanently, cascading its scopes, requirements, user stories, comments and page links; linked tickets are kept but unlinked.',
      params: z.object({ id: id('Feature') }),
      run: (client, { id }) => client.features.delete(id),
    }),
    link_page: op({
      summary:
        'Link a Knowledge page (PRD, spec, research) to a feature. Idempotent: re-linking updates the scope pin. Page must be in the feature’s workspace.',
      params: z.object({
        featureId: id('Feature'),
        pageId: id('Page'),
        scopeId: z
          .string()
          .optional()
          .describe('Pin the page to one of this feature’s scopes; omitting it on a re-link clears an existing pin'),
      }),
      run: (client, params) => client.features.linkPage(params),
    }),
    unlink_page: op({
      summary: 'Unlink a page from a feature. The page itself is not deleted; no-op if not linked.',
      params: z.object({
        featureId: id('Feature'),
        pageId: id('Page'),
      }),
      run: (client, { featureId, pageId }) => client.features.unlinkPage(featureId, pageId),
    }),
  },
};
