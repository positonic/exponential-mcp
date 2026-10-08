/**
 * Domain tools: one MCP tool per SDK namespace, taking `{ operation, params }`.
 *
 * Each operation declares its params once, as a zod object. That single schema
 * drives the one-line signature in the tool description, the full JSON Schema
 * returned by `operation: "describe"`, and runtime validation — so the three
 * cannot drift apart. A validation failure returns the schema it expected, so
 * the model can correct itself on the next call without a separate lookup.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ExponentialClient } from 'exponential-sdk';

export interface Operation<S extends z.AnyZodObject = z.AnyZodObject> {
  /** One line: what the operation does and anything surprising about it. */
  summary: string;
  params: S;
  run: (client: ExponentialClient, params: z.infer<S>) => Promise<unknown>;
}

export interface Domain {
  /** Tool name, e.g. `contacts`. */
  name: string;
  /** One or two sentences: what the domain is and how it relates to others. */
  description: string;
  operations: Record<string, Operation<any>>;
}

/** Identity helper that keeps `params` inferred per operation. */
export function op<S extends z.AnyZodObject>(operation: Operation<S>): Operation<S> {
  return operation;
}

/** Shared param building blocks. */
export const id = (what: string) => z.string().describe(`${what} ID`);
export const workspaceId = z.string().describe('Workspace ID (see the `workspaces` tool)');
/** ISO date or datetime; coerced to a Date before it reaches the SDK. */
export const date = (what: string) => z.coerce.date().describe(`${what} (ISO 8601 date or datetime)`);

const DESCRIBE = 'describe';

function signature(name: string, params: z.AnyZodObject): string {
  const keys = Object.entries(params.shape as Record<string, z.ZodTypeAny>).map(
    ([key, schema]) => (schema.isOptional() ? `${key}?` : key)
  );
  return `${name}(${keys.join(', ')})`;
}

function paramsJsonSchema(params: z.AnyZodObject): unknown {
  // Cast: zodToJsonSchema's generics recurse too deep on a bare AnyZodObject (TS2589).
  const { $schema: _ignored, ...schema } = zodToJsonSchema(params as z.ZodTypeAny as never, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  return schema;
}

export function toolDefinition(domain: Domain): Tool {
  const operations = Object.keys(domain.operations);
  const lines = Object.entries(domain.operations).map(
    ([name, operation]) => `- ${signature(name, operation.params)} — ${operation.summary}`
  );

  return {
    name: domain.name,
    description: [
      domain.description,
      '',
      'Call with { operation, params }. Operations (? = optional param):',
      ...lines,
      `- ${DESCRIBE}(operation?) — full parameter schema for one operation, or all of them.`,
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: [...operations, DESCRIBE] },
        params: {
          type: 'object',
          description: 'Parameters for the operation, as listed in the tool description.',
        },
      },
      required: ['operation'],
    },
  };
}

function describe(domain: Domain, only: unknown): Record<string, unknown> {
  const names = typeof only === 'string' && only ? [only] : Object.keys(domain.operations);
  const out: Record<string, unknown> = {};
  for (const name of names) {
    const operation = domain.operations[name];
    if (!operation) {
      throw new Error(
        `Unknown operation "${name}" for ${domain.name}. Valid: ${Object.keys(domain.operations).join(', ')}`
      );
    }
    out[name] = { summary: operation.summary, params: paramsJsonSchema(operation.params) };
  }
  return out;
}

export async function runDomainTool(
  domain: Domain,
  client: ExponentialClient,
  args: Record<string, unknown> | undefined
): Promise<unknown> {
  const operationName = args?.operation;
  const rawParams = (args?.params ?? {}) as Record<string, unknown>;

  if (operationName === DESCRIBE) {
    return describe(domain, rawParams.operation);
  }

  const operation =
    typeof operationName === 'string' ? domain.operations[operationName] : undefined;
  if (!operation) {
    throw new Error(
      `Unknown operation "${String(operationName)}" for ${domain.name}. Valid: ${[
        ...Object.keys(domain.operations),
        DESCRIBE,
      ].join(', ')}`
    );
  }

  const parsed = operation.params.safeParse(rawParams);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue: z.ZodIssue) => `${issue.path.join('.') || 'params'}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `Invalid params for ${domain.name}.${operationName}: ${issues}\nExpected: ${JSON.stringify(
        paramsJsonSchema(operation.params)
      )}`
    );
  }

  const result = await operation.run(client, parsed.data);
  // Void SDK calls (deletes) would otherwise serialize to nothing.
  return result === undefined ? { success: true } : result;
}
