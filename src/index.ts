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
import type { Action, Project, Workspace } from 'exponential-sdk';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const LEGACY_CONFIG_PATH = join(homedir(), '.config', 'exponential-mcp', 'config.json');
const configStore = createConfigStore({ projectName: 'exponential-mcp' });

function migrateLegacyConfig(): void {
  if (configStore.isAuthenticated() || !existsSync(LEGACY_CONFIG_PATH)) {
    return;
  }

  try {
    const legacy = JSON.parse(readFileSync(LEGACY_CONFIG_PATH, 'utf-8'));
    if (legacy?.apiKey) {
      configStore.saveConfig({
        token: legacy.apiKey,
        apiUrl: legacy.baseUrl || 'https://www.exponential.im',
      });
    }
  } catch {
    // Ignore legacy config parsing errors.
  }
}

function loadClientConfig(): { token: string; apiUrl: string } {
  migrateLegacyConfig();

  if (configStore.isAuthenticated()) {
    const config = configStore.loadConfig();
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

  return { token, apiUrl };
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
    description: 'List actions/tasks. Can filter by project or status.',
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
    description: 'List OKRs (Objectives and Key Results) with their progress',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: {
          type: 'string',
          description: 'Optional workspace ID'
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
      version: '0.1.0',
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

        case 'create_action': {
          // SDK does not yet expose quickCreate, so we use the underlying tRPC client.
          const action = await trpcClient.action.quickCreate.mutate({
            text: args?.text as string,
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

        case 'complete_action': {
          // SDK does not yet expose action updates, so we use the underlying tRPC client.
          const action = await trpcClient.action.update.mutate({
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

        case 'get_goals': {
          const goals = await trpcClient.goal.list.query({
            workspaceId: args?.workspaceId as string,
          });
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(goals, null, 2),
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
