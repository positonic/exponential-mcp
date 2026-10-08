import { z } from 'zod';
import { type Domain, id, op, workspaceId } from './framework.js';

const ENTITY_TYPES = ['action', 'ticket', 'feature', 'epic'] as const;

const TAG_COLORS = [
  'avatar-red',
  'avatar-teal',
  'avatar-blue',
  'avatar-green',
  'avatar-yellow',
  'avatar-plum',
  'avatar-mint',
  'avatar-lightYellow',
  'avatar-lightPurple',
  'avatar-lightBlue',
  'avatar-orange',
  'avatar-lightGreen',
  'avatar-lightRed',
  'avatar-skyBlue',
  'avatar-paleGreen',
  'avatar-paleYellow',
  'avatar-lavender',
  'avatar-powderBlue',
  'avatar-lightPink',
  'avatar-lightGray',
  'brand-primary',
  'brand-success',
  'brand-warning',
  'brand-error',
  'brand-info',
];

const category = z
  .string()
  .nullable()
  .optional()
  .describe('Tag category; null means a plain label');

export const labels: Domain = {
  name: 'labels',
  description:
    'Labels (tags) that can be attached to actions (`actions`), tickets (`tickets`), features (`features`) and epics (`epics`). There are global system tags and per-workspace tags; a "label" is a tag whose category is null.',
  operations: {
    list: op({
      summary:
        'List available tags as { globalTags, workspaceTags, allTags }. Without workspaceId, workspaceTags covers every workspace you belong to. Omit category for all categories; null for plain labels only.',
      params: z.object({
        workspaceId: workspaceId.optional(),
        category,
      }),
      run: (client, params) => client.labels.list(params),
    }),
    create: op({
      summary: 'Create a workspace tag. Fails if a tag with the same name (slug) already exists in the workspace.',
      params: z.object({
        workspaceId,
        name: z.string().min(1).max(50),
        color: z.string().describe(`One of: ${TAG_COLORS.join(', ')}`),
        description: z.string().max(200).optional(),
        category,
      }),
      run: (client, params) => client.labels.create(params),
    }),
    set_for_entity: op({
      summary:
        'Replace the full tag set on an action, ticket, feature or epic (an empty list clears it). Tags must be global or from the entity’s workspace.',
      params: z.object({
        entityType: z.enum(ENTITY_TYPES),
        entityId: z.string().describe('ID of the action, ticket, feature or epic'),
        tagIds: z.array(id('Tag')),
      }),
      run: (client, params) => client.labels.setEntityTags(params),
    }),
    list_for_entity: op({
      summary: 'List the tags on an action, ticket, feature or epic.',
      params: z.object({
        entityType: z.enum(ENTITY_TYPES),
        entityId: z.string().describe('ID of the action, ticket, feature or epic'),
      }),
      run: (client, params) => client.labels.listForEntity(params),
    }),
  },
};
