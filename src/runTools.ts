/**
 * Run tools (Exponential ADR-0067, Agent PRD V2): how a session the local
 * runner spawned talks to its Agent run. They exist only when the server was
 * started for a run — `EXPONENTIAL_RUN_ID` set in the environment by
 * `exponential runner start` (which also passes the Assistant's agent key as
 * `EXPONENTIAL_API_KEY` and its name as `EXPONENTIAL_RUNNER_ID`). Outside a
 * run they are not listed, so an ordinary MCP session never sees them.
 *
 * - `report_progress` — a one-line note for the run's transcript. The runner
 *   records it from the session's own tool stream, so this tool only
 *   acknowledges; nothing is written from here.
 * - `ask_owner` — asks the owner and PAUSES the run: the app posts the question
 *   as a comment mentioning the owner and parks the run; the owner's reply
 *   starts a new run. The session must stop after calling it.
 * - `finish_run` — closes the run with a public summary and whether the action
 *   is ready for the owner to confirm. The run never completes the action.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ExponentialClient } from 'exponential-sdk';

export interface RunContext {
  runId: string;
  runnerId?: string;
}

/** The run this server was started for, if any. */
export function runContextFromEnv(env: NodeJS.ProcessEnv = process.env): RunContext | null {
  const runId = env.EXPONENTIAL_RUN_ID?.trim();
  if (!runId) return null;
  return { runId, runnerId: env.EXPONENTIAL_RUNNER_ID?.trim() || undefined };
}

const reportProgressParams = z.object({
  text: z.string().min(1).max(500).describe('One line, present tense: what you are doing now'),
});
const askOwnerParams = z.object({
  question: z
    .string()
    .min(1)
    .max(10000)
    .describe('The question, with enough context that the owner can answer from their inbox'),
});
const finishRunParams = z.object({
  summary: z
    .string()
    .min(1)
    .max(10000)
    .describe('What you did, found or delegated. Public: the requester, the owner and their teammates read it'),
  readyToClose: z
    .boolean()
    .describe('true when the work is done and the owner only needs to confirm; false when follow-up is needed'),
});

function schema(params: z.AnyZodObject): Tool['inputSchema'] {
  const { $schema: _ignored, ...rest } = zodToJsonSchema(params as z.ZodTypeAny as never, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  return rest as Tool['inputSchema'];
}

export const RUN_TOOLS: Tool[] = [
  {
    name: 'report_progress',
    description:
      'Post a one-line progress note to this run\'s transcript (owner-visible only; nobody is notified). Use it when you move to a new phase of the work.',
    inputSchema: schema(reportProgressParams),
  },
  {
    name: 'ask_owner',
    description:
      'Ask your owner a question you cannot answer yourself and PAUSE this run. The question is posted on the action mentioning the owner; their reply resumes the work in a new run. This must be your LAST call: do not call finish_run after it and do not keep working — stop immediately.',
    inputSchema: schema(askOwnerParams),
  },
  {
    name: 'finish_run',
    description:
      'Finish this run. Call it exactly once, as your last action, with a public summary and whether the action is ready for the owner to close. Never mark the action complete yourself; the owner confirms from their inbox.',
    inputSchema: schema(finishRunParams),
  },
];

export const RUN_TOOL_NAMES = new Set(RUN_TOOLS.map((t) => t.name));

/** Dispatch one run tool. The caller has already checked `RUN_TOOL_NAMES.has(name)`. */
export async function runRunTool(
  client: Pick<ExponentialClient, 'agentRuns'>,
  context: RunContext,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<unknown> {
  switch (name) {
    case 'report_progress': {
      const { text } = reportProgressParams.parse(args ?? {});
      return { ok: true, text };
    }
    case 'ask_owner': {
      const { question } = askOwnerParams.parse(args ?? {});
      const result = await client.agentRuns.finish(
        context.runId,
        { status: 'WAITING_ON_OWNER', question },
        context.runnerId
      );
      return {
        ...result,
        stop: true,
        message: result.finished
          ? 'Your question was posted and the run is now waiting on your owner. Stop here: make no further tool calls and end your turn.'
          : 'The run is no longer running (it was cancelled); nothing was posted. Stop here.',
      };
    }
    case 'finish_run': {
      const { summary, readyToClose } = finishRunParams.parse(args ?? {});
      const result = await client.agentRuns.finish(
        context.runId,
        { status: 'SUCCEEDED', summary, readyToClose },
        context.runnerId
      );
      return { ...result, message: result.finished ? 'Run finished. End your turn.' : 'The run had already ended; nothing changed. End your turn.' };
    }
    default:
      throw new Error(`Unknown run tool "${name}"`);
  }
}
