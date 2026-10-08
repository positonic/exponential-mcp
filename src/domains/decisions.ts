import { z } from 'zod';
import { type Domain, date, id, op, workspaceId } from './framework.js';

const DECISION_STATUSES = ['OPEN', 'PROPOSED', 'ACCEPTED', 'SUPERSEDED', 'DEPRECATED'] as const;
const DECISION_SOURCES = ['MEETING', 'MANUAL', 'AGENT'] as const;

const decisionId = id('Decision');
const meetingId = id('Meeting (transcription session)');
const clearable = (what: string) => z.string().nullable().optional().describe(`${what} (null to clear)`);

/** Scope links shared by create and update; all nullable to clear. */
const scopeFields = {
  productId: clearable('Product ID'),
  projectId: clearable('Project ID'),
  goalId: z.number().int().nullable().optional().describe('Objective (goal) integer ID (null to clear)'),
  keyResultId: clearable('Key result ID'),
};

export const decisions: Domain = {
  name: 'decisions',
  description:
    'The Decision Log: decisions and open questions (an open question is a decision with status OPEN — there is no separate model), optionally sourced from a meeting with transcript evidence. Meetings are in `meetings`; decisions can be linked to `tickets` and `features` as "implemented by".',
  operations: {
    list: op({
      summary: 'Confirmed decisions in a workspace, newest decided first. Never includes drafts (see list_for_meeting).',
      params: z.object({
        workspaceId,
        statuses: z.array(z.enum(DECISION_STATUSES)).optional(),
        sources: z.array(z.enum(DECISION_SOURCES)).optional(),
        productId: z.string().optional().describe('Product ID, or the literal "workspace" for decisions with no product'),
        includeWorkspaceWide: z
          .boolean()
          .optional()
          .describe('With a real productId: also include decisions that have no product'),
        projectId: id('Project').optional(),
        search: z.string().max(200).optional().describe('Free text over statement and body'),
        number: z.number().int().min(1).optional().describe('One decision by its workspace sequence number — D-0003 is 3'),
        limit: z.number().int().min(1).max(500).optional().describe('Unset returns everything visible'),
      }),
      run: (client, params) => client.decisions.list(params),
    }),
    get: op({
      summary: 'Get one decision with its deciders, evidence, links and supersession chain.',
      params: z.object({ workspaceId, decisionId }),
      run: (client, { workspaceId, decisionId }) => client.decisions.get(workspaceId, decisionId),
    }),
    list_for_meeting: op({
      summary:
        'Decisions and open questions logged from one meeting. Includes drafts if you can edit the meeting. No workspaceId needed.',
      params: z.object({ transcriptionSessionId: meetingId }),
      run: (client, { transcriptionSessionId }) => client.decisions.listForMeeting(transcriptionSessionId),
    }),
    list_for_adr: op({
      summary: 'Decisions formalised as one ADR ("Decided in").',
      params: z.object({ workspaceId, adrDocumentId: id('ADR document') }),
      run: (client, { workspaceId, adrDocumentId }) => client.decisions.listForAdr(workspaceId, adrDocumentId),
    }),
    extract_drafts: op({
      summary:
        'AI-extract DRAFT decisions from a meeting’s notes and transcript for review. Idempotent: existing drafts come back; a meeting with confirmed decisions reports alreadyPublished.',
      params: z.object({ transcriptionSessionId: meetingId }),
      run: (client, { transcriptionSessionId }) => client.decisions.extractDrafts(transcriptionSessionId),
    }),
    create: op({
      summary:
        'Log a decision (status defaults to PROPOSED). Pass status "OPEN" for an open question and transcriptionSessionId to attach it to a meeting.',
      params: z.object({
        workspaceId,
        statement: z.string().max(500).describe('The decision itself, or the open question'),
        body: z.string().max(20000).nullable().optional().describe('Markdown detail — context, alternatives, consequences'),
        status: z
          .enum(DECISION_STATUSES)
          .optional()
          .describe('SUPERSEDED and DEPRECATED are rejected here — use set_status'),
        source: z.enum(DECISION_SOURCES).optional(),
        decidedAt: date('When it was decided').nullable().optional(),
        ownerId: z.string().nullable().optional().describe('User ID of the owner'),
        transcriptionSessionId: z
          .string()
          .nullable()
          .optional()
          .describe('Meeting it came out of. Requires edit access to that meeting'),
        occurrenceId: z.string().nullable().optional().describe('Recurring-meeting occurrence ID'),
        ...scopeFields,
        deciders: z
          .array(
            z.object({
              userId: z.string().nullable().optional().describe('Omit for external participants'),
              name: z.string(),
              email: z.string().nullable().optional(),
            }),
          )
          .max(50)
          .optional(),
        evidence: z
          .array(
            z.object({
              turnIndex: z.number().int(),
              speaker: z.string().nullable().optional(),
              startTime: z.number().nullable().optional(),
              text: z.string(),
            }),
          )
          .max(50)
          .optional()
          .describe(
            'Quoted transcript turns. Requires transcriptionSessionId. Turns whose text does not match the transcript are silently dropped; speaker/startTime are overwritten from the transcript',
          ),
      }),
      run: (client, params) => client.decisions.create(params),
    }),
    update: op({
      summary: 'Edit a decision’s content and scope. Only the fields you pass change; status goes through set_status.',
      params: z.object({
        workspaceId,
        decisionId,
        statement: z.string().max(500).optional(),
        body: clearable('Markdown body'),
        decidedAt: date('When it was decided').nullable().optional(),
        ownerId: clearable('Owner user ID'),
        ...scopeFields,
        adrDocumentId: clearable('ADR document this decision is formalised in'),
      }),
      run: (client, params) => client.decisions.update(params),
    }),
    set_status: op({
      summary: 'Lifecycle transition — e.g. answer an open question by moving OPEN → ACCEPTED.',
      params: z.object({
        workspaceId,
        decisionId,
        status: z.enum(DECISION_STATUSES),
        supersededById: z
          .string()
          .nullable()
          .optional()
          .describe('Decision ID that replaces this one; expected when moving to SUPERSEDED'),
      }),
      run: (client, params) => client.decisions.setStatus(params),
    }),
    link_ticket: op({
      summary: 'Mark a decision as "implemented by" a ticket. Idempotent: an existing link is returned.',
      params: z.object({ workspaceId, decisionId, ticketId: id('Ticket') }),
      run: (client, { workspaceId, decisionId, ticketId }) =>
        client.decisions.linkTicket(workspaceId, decisionId, ticketId),
    }),
    link_feature: op({
      summary: 'Mark a decision as "implemented by" a feature. Idempotent: an existing link is returned.',
      params: z.object({ workspaceId, decisionId, featureId: id('Feature') }),
      run: (client, { workspaceId, decisionId, featureId }) =>
        client.decisions.linkFeature(workspaceId, decisionId, featureId),
    }),
    unlink: op({
      summary: 'Remove one ticket/feature link.',
      params: z.object({
        workspaceId,
        linkId: z.string().describe('DecisionLink ID from the decision’s links — not the ticket or feature ID'),
      }),
      run: (client, { workspaceId, linkId }) => client.decisions.unlink(workspaceId, linkId),
    }),
    confirm_draft: op({
      summary: 'Publish a DRAFT decision into the log.',
      params: z.object({ workspaceId, decisionId }),
      run: (client, { workspaceId, decisionId }) => client.decisions.confirmDraft(workspaceId, decisionId),
    }),
    reject_draft: op({
      summary: 'Reject a DRAFT decision. Confirmed decisions cannot be rejected — deprecate or supersede via set_status.',
      params: z.object({ workspaceId, decisionId }),
      run: (client, { workspaceId, decisionId }) => client.decisions.rejectDraft(workspaceId, decisionId),
    }),
    delete_draft: op({
      summary: 'Hard-delete a draft or rejected decision. Refused for confirmed decisions — the log keeps its history.',
      params: z.object({ workspaceId, decisionId }),
      run: (client, { workspaceId, decisionId }) => client.decisions.deleteDraft(workspaceId, decisionId),
    }),
  },
};
