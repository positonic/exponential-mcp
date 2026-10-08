import { z } from 'zod';
import { type Domain, id, op, workspaceId } from './framework.js';

const ORGANIZATION_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] as const;

export const organizations: Domain = {
  name: 'organizations',
  description:
    'CRM organizations (companies) in a workspace. People are in the `contacts` tool and deals in `deals`.',
  operations: {
    list: op({
      summary: 'List organizations alphabetically, with contact counts. Paginate with the returned nextCursor.',
      params: z.object({
        workspaceId,
        search: z.string().optional().describe('Case-insensitive match on name or description'),
        industry: z.string().optional().describe('Exact match'),
        limit: z.number().int().min(1).max(100).optional().describe('Default 50'),
        cursor: z.string().optional(),
      }),
      run: (client, params) => client.organizations.list(params),
    }),
    get: op({
      summary: 'Get one organization.',
      params: z.object({ id: id('Organization') }),
      run: (client, { id }) => client.organizations.get(id),
    }),
    create: op({
      summary: 'Create an organization.',
      params: z.object({
        workspaceId,
        name: z.string(),
        websiteUrl: z.string().nullable().optional().describe('Full URL including scheme'),
        logoUrl: z.string().nullable().optional().describe('Full URL including scheme'),
        description: z.string().optional(),
        industry: z.string().optional(),
        size: z.enum(ORGANIZATION_SIZES).optional().describe('Headcount band'),
      }),
      run: (client, params) => client.organizations.create(params),
    }),
  },
};
