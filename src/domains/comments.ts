import { z } from 'zod';
import type { ExponentialClient } from 'exponential-sdk';
import { type Domain, op } from './framework.js';

const TARGETS = ['action', 'feature', 'page', 'goal', 'ticket'] as const;
type Target = (typeof TARGETS)[number];

const target = z.enum(TARGETS).describe('Kind of entity the comment is on');
const targetId = z
  .union([z.string(), z.number()])
  .describe('ID of the entity being commented on: the action/feature/page/ticket ID, or the goal’s integer ID');
const commentId = z.string().describe('Comment ID');
const body = z
  .string()
  .min(1)
  .describe('Comment text (markdown). Mention members with @[Name](userId) — see the `workspaces` tool’s members');

function unsupported(operation: string, t: Target, supported: string): never {
  throw new Error(`comments.${operation} is not supported for target "${t}". Supported targets: ${supported}.`);
}

function goalIdOf(value: string | number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n)) {
    throw new Error(`Goal targetId must be an integer, got ${JSON.stringify(value)}.`);
  }
  return n;
}

/** Target-specific add fields, rejected loudly on other targets rather than silently dropped. */
function assertOnly(t: Target, allowed: Target | Target[], fields: Record<string, unknown>): void {
  const targets = Array.isArray(allowed) ? allowed : [allowed];
  if (targets.includes(t)) return;
  const present = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k]) => k);
  if (present.length) {
    const names = targets.map((a) => `"${a}"`).join(' or ');
    throw new Error(`${present.join(', ')} can only be used with target ${names}, not "${t}".`);
  }
}

async function listTicketComments(client: ExponentialClient, ticketId: string): Promise<unknown> {
  // There is no standalone ticket-comment list endpoint; the detail read carries them.
  const ticket = await client.tickets.get(ticketId);
  return ticket.comments ?? [];
}

export const comments: Domain = {
  name: 'comments',
  description:
    'Comments on actions, features (PRDs), knowledge pages, goals (objectives) and tickets — pick the entity with `target`. Anchored threads (a comment on a span of the body), threaded replies and resolve/unresolve exist on features and pages. Editing and deleting are author-only.',
  operations: {
    list: op({
      summary:
        'List comments on an entity. All targets. For tickets this reads the ticket detail (newest first) — there is no separate list endpoint.',
      params: z.object({ target, targetId }),
      run: (client, { target: t, targetId: tid }) => {
        switch (t) {
          case 'action':
            return client.actionComments.list(String(tid));
          case 'feature':
            return client.featureComments.list(String(tid));
          case 'page':
            return client.pageComments.list(String(tid));
          case 'goal':
            return client.goalComments.list(goalIdOf(tid));
          case 'ticket':
            return listTicketComments(client, String(tid));
        }
      },
    }),
    add: op({
      summary:
        'Add a top-level comment. All targets. On a page, pass quotedText to anchor the comment to that span of the body: the server mints the threadId, highlights the span, and refuses the comment if the text matches no span or several (add quotePrefix/quoteSuffix to pick one). scopeId/threadId are feature-only, parentUpdateId is goal-only.',
      params: z.object({
        target,
        targetId,
        body,
        scopeId: z.string().optional().describe('Feature only: post to this scope’s activity feed instead of the feature’s'),
        threadId: z.string().optional().describe('Feature only: anchor to a span of the PRD body; omit for a doc-level comment'),
        quotedText: z
          .string()
          .optional()
          .describe(
            'Feature or page: the anchored text being quoted. On a page this alone anchors the comment; copy the text exactly as it reads on the page, without markdown syntax',
          ),
        quotePrefix: z
          .string()
          .max(200)
          .optional()
          .describe('Page only, with quotedText: the text just before the quote, to pick one of several matches'),
        quoteSuffix: z
          .string()
          .max(200)
          .optional()
          .describe('Page only, with quotedText: the text just after the quote, to pick one of several matches'),
        parentUpdateId: z.string().optional().describe('Goal only: thread under this goal update instead of the goal itself'),
      }),
      run: (
        client,
        { target: t, targetId: tid, body, scopeId, threadId, quotedText, quotePrefix, quoteSuffix, parentUpdateId },
      ) => {
        assertOnly(t, 'feature', { scopeId, threadId });
        assertOnly(t, ['feature', 'page'], { quotedText });
        assertOnly(t, 'page', { quotePrefix, quoteSuffix });
        assertOnly(t, 'goal', { parentUpdateId });
        if ((quotePrefix !== undefined || quoteSuffix !== undefined) && quotedText === undefined) {
          throw new Error('quotePrefix/quoteSuffix need quotedText.');
        }
        switch (t) {
          case 'action':
            return client.actionComments.add({ actionId: String(tid), content: body });
          case 'feature':
            return client.featureComments.create({ featureId: String(tid), body, scopeId, threadId, quotedText });
          case 'page':
            return client.pageComments.create({
              pageId: String(tid),
              body,
              ...(quotedText !== undefined ? { quotedText } : {}),
              ...(quotePrefix !== undefined || quoteSuffix !== undefined
                ? { quoteContext: { prefix: quotePrefix, suffix: quoteSuffix } }
                : {}),
            });
          case 'goal':
            return client.goalComments.add({ goalId: goalIdOf(tid), content: body, parentUpdateId });
          case 'ticket':
            return client.tickets.addComment({ ticketId: String(tid), content: body });
        }
      },
    }),
    update: op({
      summary: 'Replace a comment’s text. All targets; author-only.',
      params: z.object({ target, commentId, body }),
      run: (client, { target: t, commentId, body }) => {
        switch (t) {
          case 'action':
            return client.actionComments.update({ commentId, content: body });
          case 'feature':
            return client.featureComments.update({ commentId, body });
          case 'page':
            return client.pageComments.update({ commentId, body });
          case 'goal':
            return client.goalComments.update({ commentId, content: body });
          case 'ticket':
            return client.tickets.updateComment({ id: commentId, content: body });
        }
      },
    }),
    delete: op({
      summary: 'Delete a comment permanently. All targets; author-only. On features, deleting a root also deletes its replies.',
      params: z.object({ target, commentId }),
      run: (client, { target: t, commentId }) => {
        switch (t) {
          case 'action':
            return client.actionComments.delete(commentId);
          case 'feature':
            return client.featureComments.delete(commentId);
          case 'page':
            return client.pageComments.delete(commentId);
          case 'goal':
            return client.goalComments.delete(commentId);
          case 'ticket':
            return client.tickets.deleteComment(commentId);
        }
      },
    }),
    reply: op({
      summary: 'Reply to a comment. Feature and page targets. Replies to replies still hang off the root comment.',
      params: z.object({
        target,
        commentId: z.string().describe('ID of the comment being replied to'),
        body,
      }),
      run: (client, { target: t, commentId, body }) => {
        if (t === 'page') return client.pageComments.reply({ parentId: commentId, body });
        if (t !== 'feature') unsupported('reply', t, 'feature, page');
        return client.featureComments.reply({ parentId: commentId, body });
      },
    }),
    resolve: op({
      summary: 'Mark an anchored comment thread resolved. Feature and page targets; only anchored threads have a threadId.',
      params: z.object({
        target,
        targetId,
        threadId: z.string().describe('The anchored thread’s threadId (from the comment), not a comment ID'),
      }),
      run: (client, { target: t, targetId: tid, threadId }) => {
        if (t === 'page') return client.pageComments.resolve({ pageId: String(tid), threadId });
        if (t !== 'feature') unsupported('resolve', t, 'feature, page');
        return client.featureComments.resolve({ featureId: String(tid), threadId });
      },
    }),
    unresolve: op({
      summary: 'Reopen a resolved anchored comment thread. Feature and page targets.',
      params: z.object({
        target,
        targetId,
        threadId: z.string().describe('The anchored thread’s threadId (from the comment), not a comment ID'),
      }),
      run: (client, { target: t, targetId: tid, threadId }) => {
        if (t === 'page') return client.pageComments.unresolve({ pageId: String(tid), threadId });
        if (t !== 'feature') unsupported('unresolve', t, 'feature, page');
        return client.featureComments.unresolve({ featureId: String(tid), threadId });
      },
    }),
  },
};
