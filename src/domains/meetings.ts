import { z } from 'zod';
import { type Domain, date, id, op } from './framework.js';

const meetingId = id('Meeting');

export const meetings: Domain = {
  name: 'meetings',
  description:
    'Meetings (transcription sessions): recorded, imported or manually created, each with free-form `notes`, an AI `summary` and the raw `transcription`. Actions extracted from them are in the `actions` tool; people in `contacts`.',
  operations: {
    list: op({
      summary:
        'List meetings you can see (owner, participant, project or workspace access), newest first. Rows include full notes/summary/transcription — expect large payloads.',
      params: z.object({
        workspaceId: z
          .string()
          .optional()
          .describe('Workspace ID (see the `workspaces` tool); omit for all workspaces'),
        includeArchived: z.boolean().optional(),
        meetingType: z
          .enum(['all', 'mine', 'one_on_one', 'customer', 'internal'])
          .optional()
          .describe('mine = you own or attend; one_on_one = exactly two participants; customer/internal always empty for now'),
      }),
      run: (client, params) => client.meetings.list(params),
    }),
    get: op({
      summary: 'Get one meeting with participants, linked actions, workspace and project.',
      params: z.object({ id: meetingId }),
      run: (client, { id }) => client.meetings.get(id),
    }),
    create: op({
      summary: 'Create a meeting manually. A project-linked meeting inherits its project’s workspace.',
      params: z.object({
        title: z.string(),
        transcription: z.string().min(1).describe('Raw transcript text (required, non-empty)'),
        description: z.string().optional(),
        notes: z.string().optional().describe('Meeting notes (Markdown)'),
        meetingDate: date('When the meeting happened').optional(),
        projectId: id('Project').optional(),
        workspaceId: z.string().optional().describe('Workspace ID (see the `workspaces` tool)'),
        participants: z
          .array(
            z.object({
              userId: z.string().optional().describe('Workspace member user ID'),
              contactId: z.string().optional().describe('CRM contact ID'),
              email: z.string().optional(),
              name: z.string().optional(),
            })
          )
          .optional()
          .describe('Each: a member (userId), a CRM contact (contactId), or a name/email'),
      }),
      run: (client, params) => client.meetings.create(params),
    }),
    update: op({
      summary:
        'Update a meeting. Only the fields you pass change; passing none is an error. `notes` replaces the whole body — use append_notes to add.',
      params: z.object({
        id: meetingId,
        title: z.string().optional(),
        description: z.string().optional(),
        notes: z.string().optional(),
        summary: z.string().optional(),
        transcription: z.string().optional(),
        meetingDate: date('When the meeting happened').nullable().optional(),
        workspaceId: z.string().nullable().optional().describe('Workspace ID (null to clear)'),
      }),
      run: (client, params) => client.meetings.update(params),
    }),
    get_notes: op({
      summary: 'Get just the meeting’s notes body (null when none written).',
      params: z.object({ id: meetingId }),
      run: (client, { id }) => client.meetings.getNotes(id),
    }),
    set_notes: op({
      summary: 'Replace the meeting’s notes wholesale.',
      params: z.object({ id: meetingId, notes: z.string() }),
      run: (client, { id, notes }) => client.meetings.setNotes(id, notes),
    }),
    append_notes: op({
      summary:
        'Append a block to the meeting’s notes (blank-line separated), creating them if empty. Read-modify-write, not atomic.',
      params: z.object({ id: meetingId, text: z.string() }),
      run: (client, { id, text }) => client.meetings.appendNotes(id, text),
    }),
    delete: op({
      summary:
        'Permanently delete one meeting you own (FORBIDDEN otherwise). Linked actions survive, unlinked.',
      params: z.object({ id: meetingId }),
      run: (client, { id }) => client.meetings.delete(id),
    }),
    delete_many: op({
      summary:
        'Permanently delete meetings in bulk. Ids that are missing or not yours are silently skipped — compare the returned count to what you sent.',
      params: z.object({ ids: z.array(meetingId) }),
      run: (client, { ids }) => client.meetings.deleteMany(ids),
    }),
  },
};
