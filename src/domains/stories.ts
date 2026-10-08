import { z } from 'zod';
import { type Domain, id, op } from './framework.js';

const storyFields = {
  asA: z.string().max(500).optional().describe('"As a …" — the role'),
  iWant: z.string().max(1000).optional().describe('"I want …" — the capability'),
  soThat: z.string().max(1000).optional().describe('"So that …" — the benefit'),
  acceptanceCriteria: z.string().optional(),
};

export const stories: Domain = {
  name: 'stories',
  description:
    'User stories on a feature (As a / I want / So that, plus acceptance criteria), optionally grouped under one of the feature’s scopes. Features live in `features`, scopes in `scopes`.',
  operations: {
    list: op({
      summary: 'List a feature’s user stories in display order.',
      params: z.object({ featureId: id('Feature') }),
      run: (client, params) => client.userStories.list(params),
    }),
    create: op({
      summary: 'Add a user story to a feature, appended at the end of the display order.',
      params: z.object({
        featureId: id('Feature'),
        ...storyFields,
        scopeId: id('Feature scope').optional().describe('Feature scope ID; must belong to the same feature'),
      }),
      run: (client, params) => client.userStories.create(params),
    }),
    update: op({
      summary: 'Update a user story. Only the fields you pass change.',
      params: z.object({
        id: id('User story'),
        ...storyFields,
        scopeId: z
          .string()
          .nullable()
          .optional()
          .describe('Feature scope ID, which must belong to the story’s feature (null to ungroup)'),
      }),
      run: (client, params) => client.userStories.update(params),
    }),
    delete: op({
      summary: 'Delete a user story permanently.',
      params: z.object({ id: id('User story') }),
      run: (client, { id }) => client.userStories.delete(id),
    }),
  },
};
