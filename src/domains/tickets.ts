import { z } from 'zod';
import { type Domain, id, op } from './framework.js';

const TICKET_STATUSES = [
  'BACKLOG',
  'NEEDS_REFINEMENT',
  'READY_TO_PLAN',
  'COMMITTED',
  'IN_PROGRESS',
  'BLOCKED',
  'QA',
  'DONE',
  'DEPLOYED',
  'ARCHIVED',
] as const;

const TICKET_TYPES = ['BUG', 'FEATURE', 'CHORE', 'IMPROVEMENT', 'SPIKE', 'RESEARCH'] as const;

const ticketId = z.string().describe('Ticket ID (the CUID, not the shortId or number — find it with `search`)');
const url = (what: string) => z.string().url().max(500).describe(`${what} URL`);
const clearable = <T extends z.ZodTypeAny>(schema: T, what: string) =>
  schema.nullable().optional().describe(`${what} (null to clear)`);

export const tickets: Domain = {
  name: 'tickets',
  description:
    'Tickets: the unit of work in a product backlog, with blocking dependencies and linked actions. Always product-scoped (see `products`); they can point at a feature (`features`), scope (`scopes`), epic (`epics`) and cycle. Ticket comments are in the `comments` tool and labels in `labels`.',
  operations: {
    list: op({
      summary:
        'List every ticket in one product with full fields (body included), optionally filtered. No workspace-wide query — call once per product. prUrl/branchName are exact-match filters applied after the fetch.',
      params: z.object({
        productId: id('Product'),
        status: z.enum(TICKET_STATUSES).optional(),
        type: z.enum(TICKET_TYPES).optional(),
        featureId: id('Feature').optional(),
        epicId: id('Epic').optional(),
        cycleId: id('Cycle').optional(),
        assigneeId: id('User').optional(),
        prUrl: z.string().optional().describe('Exact match on the ticket’s PR URL'),
        branchName: z.string().optional().describe('Exact match on the ticket’s branch name'),
      }),
      run: (client, params) => client.tickets.list(params),
    }),
    get: op({
      summary:
        'Get one ticket in full: body, product, dependencies (dependsOn / requiredFor), linked actions and comments (newest first).',
      params: z.object({ id: ticketId }),
      run: (client, { id }) => client.tickets.get(id),
    }),
    create: op({
      summary: 'Create a ticket in a product. Number and shortId are assigned server-side.',
      params: z.object({
        productId: id('Product'),
        title: z.string().min(1).max(300),
        body: z.string().optional().describe('Markdown body. Omit with templateId to start from the template’s body'),
        type: z.enum(TICKET_TYPES).optional(),
        status: z.enum(TICKET_STATUSES).optional(),
        priority: z.number().int().min(0).max(4).optional().describe('0–4; lower is higher priority'),
        points: z.number().optional(),
        branchName: z.string().optional(),
        prUrl: url('Pull request').optional(),
        designUrl: url('Design').optional(),
        specUrl: url('Spec').optional(),
        links: z.record(z.string()).optional().describe('Extra named links, label → URL'),
        epicId: id('Epic').optional(),
        featureId: id('Feature').optional(),
        cycleId: id('Cycle').optional(),
        scopeId: id('Feature scope').optional(),
        assigneeId: id('User').optional().describe('User ID; must be a member of the product’s workspace'),
        templateId: id('Ticket template').optional(),
      }),
      run: (client, params) => client.tickets.create(params),
    }),
    update: op({
      summary: 'Update a ticket. Only the fields you pass change.',
      params: z.object({
        id: ticketId,
        title: z.string().min(1).max(300).optional(),
        body: z.string().optional().describe('Markdown body; replaces the whole body'),
        type: z.enum(TICKET_TYPES).optional(),
        status: z.enum(TICKET_STATUSES).optional(),
        priority: clearable(z.number().int().min(0).max(4), 'Priority 0–4, lower is higher'),
        points: clearable(z.number(), 'Story points'),
        branchName: clearable(z.string(), 'Branch name'),
        prUrl: clearable(z.string().url().max(500), 'Pull request URL'),
        designUrl: clearable(z.string().url().max(500), 'Design URL'),
        specUrl: clearable(z.string().url().max(500), 'Spec URL'),
        links: clearable(z.record(z.string()), 'Named links, label → URL; replaces the whole map'),
        epicId: clearable(z.string(), 'Epic ID'),
        featureId: clearable(z.string(), 'Feature ID'),
        cycleId: clearable(z.string(), 'Cycle ID'),
        scopeId: clearable(z.string(), 'Feature scope ID'),
        assigneeId: clearable(z.string(), 'Assignee user ID'),
      }),
      run: (client, params) => client.tickets.update(params),
    }),
    delete: op({
      summary:
        'Delete a ticket permanently, with its comments and dependency edges. Linked actions are kept but unlinked.',
      params: z.object({ id: ticketId }),
      run: (client, { id }) => client.tickets.delete(id),
    }),
    search: op({
      summary:
        'Quick picker search within one product: matches title, shortId or ticket number and returns slim rows (id, number, shortId, title, status, priority, assignee), most recently updated first. Use `list` for full tickets or field filters.',
      params: z.object({
        productId: id('Product'),
        query: z.string().max(200).optional().describe('Title substring, shortId, or a bare ticket number'),
        excludeTicketId: id('Ticket to leave out of the results').optional(),
        limit: z.number().int().min(1).max(50).optional().describe('Default 20'),
      }),
      run: (client, params) => client.tickets.search(params),
    }),
    add_dependency: op({
      summary:
        'Mark ticketId as blocked by dependsOnId. Both must be in the same product; rejects self-dependencies and cycles. Idempotent.',
      params: z.object({
        ticketId: id('Blocked ticket'),
        dependsOnId: id('Blocking ticket'),
      }),
      run: (client, { ticketId, dependsOnId }) => client.tickets.addDependency(ticketId, dependsOnId),
    }),
    remove_dependency: op({
      summary: 'Remove a "ticketId is blocked by dependsOnId" edge. Succeeds even if no such edge exists.',
      params: z.object({
        ticketId: id('Blocked ticket'),
        dependsOnId: id('Blocking ticket'),
      }),
      run: (client, { ticketId, dependsOnId }) => client.tickets.removeDependency(ticketId, dependsOnId),
    }),
    link_action: op({
      summary:
        'Attach one of your own actions to a ticket (an action belongs to at most one ticket, so this moves it if already linked).',
      params: z.object({
        ticketId: id('Ticket'),
        actionId: id('Action'),
      }),
      run: (client, { ticketId, actionId }) => client.tickets.linkAction(ticketId, actionId),
    }),
    unlink_action: op({
      summary: 'Detach one of your own actions from whatever ticket it is linked to.',
      params: z.object({ actionId: id('Action') }),
      run: (client, { actionId }) => client.tickets.unlinkAction(actionId),
    }),
  },
};
