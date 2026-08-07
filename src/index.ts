#!/usr/bin/env node
/**
 * Exponential MCP Server
 * Connects Claude to your Exponential workspace
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { ExponentialClient, createConfigStore } from 'exponential-sdk';
import type {
  Action,
  GoalStatus,
  KeyResultStatus,
  Project,
  Workspace,
} from 'exponential-sdk';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LEGACY_CONFIG_PATH = join(homedir(), '.config', 'exponential-mcp', 'config.json');

// Report the real package version rather than a hand-maintained literal that drifts.
const PKG_VERSION: string = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'), 'utf-8')
).version;
const configStore = createConfigStore({ projectName: 'exponential-mcp' });

/**
 * Read the `exp` claim out of a JWT, without verifying the signature — we only
 * want to know whether it is worth sending, not whether it is trustworthy.
 *
 * Returns null for opaque tokens (`exp_agent_…` keys, which never expire) and
 * for anything that does not parse as a JWT.
 */
function getTokenExpiry(token: string): Date | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf-8'));
    return typeof payload?.exp === 'number' ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

function assertTokenIsUsable(token: string, source: string): void {
  const expiry = getTokenExpiry(token);
  if (!expiry || expiry.getTime() > Date.now()) {
    return;
  }

  console.error(`Error: token expired on ${expiry.toISOString().slice(0, 10)} (${source}).`);
  console.error('Run "npx exponential-mcp init" to store a fresh token.');
  process.exit(1);
}

function migrateLegacyConfig(): void {
  if (configStore.isAuthenticated() || !existsSync(LEGACY_CONFIG_PATH)) {
    return;
  }

  try {
    const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, 'utf-8'));
    if (!legacy?.apiKey) {
      return;
    }

    // Don't resurrect a dead token: the legacy file long outlives the JWT in it,
    // so migrating one blindly turns every config reset into a silent 401.
    const expiry = getTokenExpiry(legacy.apiKey);
    if (expiry && expiry.getTime() <= Date.now()) {
      console.error(
        `Note: ignoring legacy config at ${LEGACY_CONFIG_PATH} — its token expired on ${expiry
          .toISOString()
          .slice(0, 10)}.`
      );
      return;
    }

    configStore.saveConfig({
      token: legacy.apiKey,
      apiUrl: legacy.baseUrl || 'https://www.exponential.im',
    });
  } catch {
    // Ignore legacy config parsing errors.
  }
}

function loadClientConfig(): { token: string; apiUrl: string } {
  migrateLegacyConfig();

  if (configStore.isAuthenticated()) {
    const config = configStore.loadConfig();
    assertTokenIsUsable(config.token, 'stored config');
    return { token: config.token, apiUrl: config.apiUrl };
  }

  const token = process.env.EXPONENTIAL_API_KEY || process.env.EXPONENTIAL_API_TOKEN;
  const apiUrl =
    process.env.EXPONENTIAL_API_URL ||
    process.env.EXPONENTIAL_BASE_URL ||
    'https://www.exponential.im';

  if (!token) {
    console.error('Error: No API key found.');
    console.error(
      'Run "npx exponential-mcp init" to set up, or set EXPONENTIAL_API_KEY env var.'
    );
    process.exit(1);
  }

  assertTokenIsUsable(token, 'EXPONENTIAL_API_KEY');
  return { token, apiUrl };
}

/**
 * `undefined` = leave the field alone, `null` = clear it, otherwise a Date.
 * MCP arguments arrive as JSON, so an explicit clear can be either a real null
 * or the string "null" depending on how the model emits it.
 */
function parseDateArg(raw: unknown): Date | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === 'null') return null;
  const parsed = new Date(raw as string);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Invalid date "${String(raw)}". Use an ISO datetime, or null to clear.`);
  }
  return parsed;
}

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'get_projects',
    description: 'List all projects in Exponential. Returns project names, status, and progress.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Optional workspace ID to filter projects'
        }
      }
    }
  },
  {
    name: 'get_actions',
    description:
      'List actions/tasks, optionally filtered by project or status. This is a flat list with no date filtering — to answer "what should I work on today" or "what am I behind on", use get_todays_actions instead.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Filter by project ID'
        },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
          description: 'Filter by status (default: ACTIVE)'
        }
      }
    }
  },
  {
    name: 'get_todays_actions',
    description:
      "What is on the user's plate right now, split into overdue / today / inbox. This is the same set the /today page renders, across all workspaces. Use this FIRST for any question about today, this week, priorities, what to work on, or what the user is behind on — it is the only tool that surfaces overdue work. Returns action IDs, so pair it with update_action, defer_actions, or reschedule_actions to act on what it finds.",
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Optional workspace ID. Omit to span all workspaces (usually what you want).'
        }
      }
    }
  },
  {
    name: 'get_overdue_triage',
    description:
      'Explain WHY the overdue pile is the size it is, before proposing what to do about it. Splits overdue actions into "cohorts" — groups sharing one exact timestamp, the fingerprint of a bulk write like a generated project plan, which were almost certainly never individually due — and "loose" individually-dated actions, which are real missed commitments. Use this whenever the user has a lot of overdue work: recommend defer_actions (amnesty) for cohorts and a real decision for loose items. Rescheduling a cohort just re-inflicts the pile tomorrow.',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Optional workspace ID. Omit to span all workspaces.'
        }
      }
    }
  },
  {
    name: 'update_action',
    description:
      'Update an action: rename, re-prioritise, move project, change status, or set its dates. scheduledStart is the "do date" — when the user plans to work on it — and it is what /today partitions on, taking precedence over dueDate. To move something out of the overdue bucket you must set scheduledStart; changing dueDate alone will not do it.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Action ID' },
        name: { type: 'string', description: 'New name' },
        description: { type: 'string', description: 'New description' },
        projectId: { type: 'string', description: 'Move to this project ID' },
        status: {
          type: 'string',
          enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
          description: 'New status'
        },
        dueDate: {
          type: 'string',
          description: 'Deadline as an ISO datetime, or null to clear'
        },
        scheduledStart: {
          type: 'string',
          description: 'Do-date as an ISO datetime (e.g. 2026-08-05T09:00:00Z), or null to clear'
        },
        scheduledEnd: {
          type: 'string',
          description: 'End of the time block as an ISO datetime, or null to clear'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'defer_actions',
    description:
      'Amnesty: clear the dates on these actions so they fall back to their project backlog untimed. Use for work that was never really due on the date it carries — most often a bulk-created cohort from get_overdue_triage. The actions stay ACTIVE and are not deleted or archived; they simply stop counting as overdue. Prefer this over reschedule_actions when the dates were never a real commitment.',
    inputSchema: {
      type: 'object',
      properties: {
        actionIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Action IDs to defer'
        }
      },
      required: ['actionIds']
    }
  },
  {
    name: 'reschedule_actions',
    description:
      'Move actions to a new do-date, for work that genuinely is still due, just later. Sets scheduledStart, pushing dueDate forward only where it would otherwise fall before it. If the actions were bulk-created and never individually due, use defer_actions instead — rescheduling them only re-inflicts the same pile tomorrow.',
    inputSchema: {
      type: 'object',
      properties: {
        actionIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Action IDs to reschedule'
        },
        date: {
          type: 'string',
          description: 'New do-date as an ISO datetime (e.g. 2026-08-05T09:00:00Z)'
        }
      },
      required: ['actionIds', 'date']
    }
  },
  {
    name: 'create_action',
    description: 'Create a new action/task. Supports natural language with dates and project names.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Action description (can include "tomorrow", "next week", project names, etc.)'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'complete_action',
    description: 'Mark an action as completed',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Action ID to complete'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'get_goals',
    description:
      "List objectives (goals). Each objective carries its linked projects, which is how work ladders up to an OKR: every action has a projectId. Objectives have INTEGER ids — key results, which are separate, have CUIDs (see get_key_results). Use tree: true for the annual → quarterly cascade.",
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description:
            'Optional workspace ID. With it the list is workspace-wide (every member\'s objectives); without it you get your own.'
        },
        period: {
          type: 'string',
          description: 'Optional period filter, e.g. "Q3-2026" or "Annual-2026"'
        },
        status: {
          type: 'string',
          description: 'Optional status: planned, active, completed, archived, on-hold'
        },
        tree: {
          type: 'boolean',
          description:
            'Return objectives nested parent → child (up to 5 levels), each with its projects and key results, instead of a flat list'
        }
      }
    }
  },
  {
    name: 'get_key_results',
    description:
      "List key results — the measurable half of an OKR. By default groups them under their objectives (the richest read: one call for 'how is the quarter going'). Pass flat: true for a bare list. Key result ids are CUIDs; the goalId tying one to its objective is an integer.",
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description:
            "Optional workspace ID. With it the list is workspace-wide (every member's key results); without it you get your own."
        },
        period: {
          type: 'string',
          description: 'Optional period filter, e.g. "Q3-2026"'
        },
        goalId: {
          type: 'number',
          description: 'Optional objective ID (an integer). Only applies with flat: true.'
        },
        status: {
          type: 'string',
          description:
            'Optional status: not-started, on-track, at-risk, off-track, achieved. Only applies with flat: true.'
        },
        flat: {
          type: 'boolean',
          description: 'Return a flat list of key results rather than grouping them by objective'
        }
      }
    }
  },
  {
    name: 'search',
    description:
      "Global text search across everything the user can access — projects, actions/tasks, goals, workspaces (and more entity types as the API grows). Same coverage as the app's Cmd+K palette. Returns typed results with ids, workspace, and app URL.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        workspaceId: {
          type: 'string',
          description: 'Optional workspace ID to restrict results to one workspace'
        },
        limit: {
          type: 'number',
          description: 'Max results per entity type (1-25, default 10)'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'get_workspaces',
    description: 'List all workspaces the user has access to',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

async function main() {
  const config = loadClientConfig();
  const client = new ExponentialClient({
    token: config.token,
    apiUrl: config.apiUrl,
  });
  const trpcClient = (client as unknown as { client: any }).client;

  const server = new Server(
    {
      name: 'exponential-mcp',
      version: PKG_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'get_projects': {
          const projects: Project[] = await client.projects.list({
            workspaceId: args?.workspaceId as string,
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(projects, null, 2),
              },
            ],
          };
        }

        case 'get_actions': {
          const status = args?.status as string | undefined;
          const projectId = args?.projectId as string | undefined;
          let actions: Action[];

          if (status === 'COMPLETED') {
            actions = await client.actions.getKanban({
              projectId,
              status: 'DONE',
            });
          } else if (status === 'CANCELLED') {
            actions = await client.actions.getKanban({
              projectId,
              status: 'CANCELLED',
            });
          } else {
            actions = await client.actions.list({ projectId });
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(actions, null, 2),
              },
            ],
          };
        }

        case 'get_todays_actions': {
          const todays = await client.actions.getTodaysActions(
            args?.workspaceId as string | undefined,
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(todays, null, 2),
              },
            ],
          };
        }

        case 'get_overdue_triage': {
          const triage = await client.actions.getOverdueTriage(
            args?.workspaceId as string | undefined,
          );
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(triage, null, 2),
              },
            ],
          };
        }

        case 'create_action': {
          // quickCreate's input field is `name`, not `text` -- it parses natural
          // language out of the name itself (dates, project names) when
          // parseNaturalLanguage is on, which it is by default.
          const action = await trpcClient.action.quickCreate.mutate({
            name: args?.text as string,
          });
          return {
            content: [
              {
                type: 'text',
                text: `Created action: ${action.name} (ID: ${action.id})`,
              },
            ],
          };
        }

        case 'update_action': {
          const action = await client.actions.update({
            id: args?.id as string,
            name: args?.name as string | undefined,
            description: args?.description as string | undefined,
            projectId: args?.projectId as string | undefined,
            status: args?.status as 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | undefined,
            dueDate: parseDateArg(args?.dueDate),
            scheduledStart: parseDateArg(args?.scheduledStart),
            scheduledEnd: parseDateArg(args?.scheduledEnd),
          });
          return {
            content: [
              {
                type: 'text',
                text: `Updated: ${action.name} (ID: ${action.id})`,
              },
            ],
          };
        }

        case 'defer_actions': {
          const result = await client.actions.bulkDefer(args?.actionIds as string[]);
          return {
            content: [
              {
                type: 'text',
                text: result.message,
              },
            ],
          };
        }

        case 'reschedule_actions': {
          const when = new Date(args?.date as string);
          if (isNaN(when.getTime())) {
            throw new Error(`Invalid date "${String(args?.date)}". Use an ISO datetime.`);
          }
          const result = await client.actions.bulkReschedule(
            args?.actionIds as string[],
            when,
          );
          return {
            content: [
              {
                type: 'text',
                text: `Rescheduled ${result.count} action${result.count === 1 ? '' : 's'} to ${when.toISOString()}`,
              },
            ],
          };
        }

        case 'complete_action': {
          const action = await client.actions.update({
            id: args?.id as string,
            status: 'COMPLETED',
          });
          return {
            content: [
              {
                type: 'text',
                text: `Completed: ${action.name}`,
              },
            ],
          };
        }

        // Goes through the SDK's GoalsApi rather than a raw tRPC path. The old
        // implementation called `goal.list`, which does not exist — the tool
        // hard-errored with `No procedure found on path "goal.list"` on every
        // invocation.
        case 'get_goals': {
          const workspaceId = args?.workspaceId as string | undefined;
          const period = args?.period as string | undefined;
          const status = args?.status as GoalStatus | undefined;
          const goals = args?.tree
            ? await client.goals.tree({ workspaceId, status })
            : await client.goals.list({ workspaceId, period, status });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(goals, null, 2),
              },
            ],
          };
        }

        case 'get_key_results': {
          const workspaceId = args?.workspaceId as string | undefined;
          const period = args?.period as string | undefined;
          const keyResults = args?.flat
            ? await client.goals.keyResults.list({
                workspaceId,
                period,
                goalId: args?.goalId as number | undefined,
                status: args?.status as KeyResultStatus | undefined,
              })
            : await client.goals.keyResults.byObjective({ workspaceId, period });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(keyResults, null, 2),
              },
            ],
          };
        }

        case 'search': {
          const results = await trpcClient.search.global.query({
            query: args?.query as string,
            workspaceId: args?.workspaceId as string | undefined,
            limit: args?.limit as number | undefined,
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          };
        }

        case 'get_workspaces': {
          const workspaces: Workspace[] = await client.workspaces.list();
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(workspaces, null, 2),
              },
            ],
          };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Exponential MCP server running');
}

main().catch(console.error);
