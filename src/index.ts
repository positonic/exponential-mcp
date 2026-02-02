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
import { ExponentialAPI } from './api.js';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// Load config
const CONFIG_PATH = join(homedir(), '.config', 'exponential-mcp', 'config.json');

interface Config {
  apiKey: string;
  baseUrl?: string;
}

function loadConfig(): Config {
  // Try config file first
  if (existsSync(CONFIG_PATH)) {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    return config;
  }
  
  // Fall back to environment variable
  const apiKey = process.env.EXPONENTIAL_API_KEY;
  if (!apiKey) {
    console.error('Error: No API key found.');
    console.error('Run "npx exponential-mcp init" to set up, or set EXPONENTIAL_API_KEY env var.');
    process.exit(1);
  }
  
  return { apiKey, baseUrl: process.env.EXPONENTIAL_BASE_URL };
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
    description: 'Search across projects, actions, and goals',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
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
  const config = loadConfig();
  const api = new ExponentialAPI(config);

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
          const projects = await api.getProjects(args?.workspaceId as string);
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
          const actions = await api.getActions({
            projectId: args?.projectId as string,
            status: args?.status as string,
          });
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
          const action = await api.quickCreateAction(args?.text as string);
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
          const action = await api.completeAction(args?.id as string);
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
          const goals = await api.getGoals(args?.workspaceId as string);
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
          const results = await api.search(args?.query as string);
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
          const workspaces = await api.getWorkspaces();
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
