import { z } from 'zod';
import { type Domain, id, op } from './framework.js';

export const requirements: Domain = {
  name: 'requirements',
  description:
    'Requirements on a feature: atomic EARS-style "shall" statements, optionally pinned to one of its scopes, each checkable met/unmet. Features are in `features`, scopes in `scopes`.',
  operations: {
    list: op({
      summary: 'List a feature’s requirements in display order, optionally only those pinned to one scope.',
      params: z.object({
        featureId: id('Feature'),
        scopeId: id('Scope').optional(),
      }),
      run: (client, params) => client.requirements.list(params),
    }),
    create: op({
      summary: 'Add a requirement to the end of a feature’s list.',
      params: z.object({
        featureId: id('Feature'),
        scopeId: id('Scope').optional().describe('Scope ID; must belong to the same feature'),
        statement: z.string().describe('One EARS-style "shall" statement'),
        kind: z.enum(['FUNCTIONAL', 'NON_FUNCTIONAL', 'CONSTRAINT']).optional(),
      }),
      run: (client, params) => client.requirements.create(params),
    }),
    set_checked: op({
      summary: 'Mark a requirement met (true, stamped with you and now) or unmet (false, clears the stamp).',
      params: z.object({
        id: id('Requirement'),
        checked: z.boolean(),
      }),
      run: (client, { id, checked }) => client.requirements.setChecked(id, checked),
    }),
    delete: op({
      summary: 'Delete a requirement permanently.',
      params: z.object({ id: id('Requirement') }),
      run: (client, { id }) => client.requirements.delete(id),
    }),
  },
};
