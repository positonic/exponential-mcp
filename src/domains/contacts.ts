import { z } from 'zod';
import { type Domain, id, op, workspaceId } from './framework.js';

const INTERACTION_TYPES = [
  'EMAIL',
  'TELEGRAM',
  'PHONE_CALL',
  'MEETING',
  'NOTE',
  'LINKEDIN',
  'OTHER',
] as const;

/** Fields shared by create and update; update additionally accepts null to clear. */
const contactFields = {
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  about: z.string().optional().describe('Free-text notes about the person'),
  profileType: z.string().optional(),
  skills: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  organizationName: z
    .string()
    .optional()
    .describe('Link to an organization by name, creating it if needed. Ignored when organizationId is set'),
};

const clearable = (what: string) => z.string().nullable().optional().describe(`${what} (null to clear)`);

export const contacts: Domain = {
  name: 'contacts',
  description:
    'CRM contacts (people) in a workspace, with their interaction history. Organizations live in the `organizations` tool and deals in `deals`. Personal fields are encrypted at rest; list/search runs server-side.',
  operations: {
    list: op({
      summary: 'List contacts, newest first. Paginate with the returned nextCursor.',
      params: z.object({
        workspaceId,
        search: z.string().optional().describe('Match on name, email or organization'),
        tags: z.array(z.string()).optional(),
        organizationId: id('Organization').optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
      run: (client, params) => client.contacts.list(params),
    }),
    get: op({
      summary: 'Get one contact, optionally with its interaction timeline.',
      params: z.object({
        id: id('Contact'),
        includeInteractions: z.boolean().optional(),
      }),
      run: (client, { id, includeInteractions }) => client.contacts.get(id, { includeInteractions }),
    }),
    create: op({
      summary: 'Create a contact.',
      params: z.object({
        workspaceId,
        ...contactFields,
        email: z.string().nullable().optional(),
        phone: z.string().optional(),
        linkedIn: z.string().optional(),
        telegram: z.string().optional(),
        twitter: z.string().optional(),
        github: z.string().optional(),
        bluesky: z.string().optional(),
        organizationId: id('Organization').optional(),
      }),
      run: (client, params) => client.contacts.create(params),
    }),
    update: op({
      summary: 'Update a contact. Only the fields you pass change.',
      params: z.object({
        id: id('Contact'),
        ...contactFields,
        email: clearable('Email'),
        phone: clearable('Phone'),
        linkedIn: clearable('LinkedIn URL'),
        telegram: clearable('Telegram handle'),
        twitter: clearable('Twitter/X handle'),
        github: clearable('GitHub handle'),
        bluesky: clearable('Bluesky handle'),
        organizationId: clearable('Organization ID'),
      }),
      run: (client, params) => client.contacts.update(params),
    }),
    delete: op({
      summary: 'Delete a contact permanently.',
      params: z.object({ id: id('Contact') }),
      run: (client, { id }) => client.contacts.delete(id),
    }),
    add_interaction: op({
      summary: 'Log an interaction (email, call, meeting, note…) on a contact’s timeline.',
      params: z.object({
        contactId: id('Contact'),
        type: z.enum(INTERACTION_TYPES),
        direction: z.enum(['INBOUND', 'OUTBOUND']),
        subject: z.string().optional(),
        notes: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
      run: (client, params) => client.contacts.addInteraction(params),
    }),
    enrich: op({
      summary:
        'Queue a web-search enrichment job for a contact. Idempotent: a job already in flight is not re-queued.',
      params: z.object({ id: id('Contact') }),
      run: (client, { id }) => client.contacts.enrich(id),
    }),
  },
};
