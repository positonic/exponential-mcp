import { z } from 'zod';
import { type Domain, date, id, op } from './framework.js';

const SCOPE_STATUSES = ['PLANNED', 'IN_PROGRESS', 'SHIPPED', 'DEPRECATED'] as const;

export const scopes: Domain = {
  name: 'scopes',
  description:
    'Feature scopes: shippable increments of a feature ("V1", "V2: auto-sync"), each with its own lifecycle. Scope status rolls up to the parent feature (see `features`); requirements can be pinned to a scope (see `requirements`).',
  operations: {
    list: op({
      summary: 'List a feature’s scopes in display order.',
      params: z.object({ featureId: id('Feature') }),
      run: (client, params) => client.scopes.list(params),
    }),
    create: op({
      summary: 'Add a scope to the end of a feature’s list. Status defaults to PLANNED; rolls up the feature’s status.',
      params: z.object({
        featureId: id('Feature'),
        version: z.string().describe('Short label for the increment, e.g. "V1" or "V2: auto-sync" (max 60 chars)'),
        description: z.string(),
        status: z.enum(SCOPE_STATUSES).optional(),
        shippedAt: date('When it shipped').optional(),
      }),
      run: (client, params) => client.scopes.create(params),
    }),
    update: op({
      summary:
        'Update a scope. Only the fields you pass change; setting SHIPPED stamps shippedAt now unless you pass one, and any status change rolls up to the feature.',
      params: z.object({
        id: id('Scope'),
        version: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(SCOPE_STATUSES).optional(),
        shippedAt: date('When it shipped').nullable().optional().describe('ISO 8601 date or datetime (null to clear)'),
        displayOrder: z.number().int().optional().describe('Position among the feature’s scopes, 0-based'),
      }),
      run: (client, params) => client.scopes.update(params),
    }),
    delete: op({
      summary:
        'Delete a scope permanently. Requirements, tickets and pages pinned to it are kept but unpinned; its comments are deleted.',
      params: z.object({ id: id('Scope') }),
      run: (client, { id }) => client.scopes.delete(id),
    }),
  },
};
