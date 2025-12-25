/**
 * Shared utilities for command modules
 */

import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { query } from '../lib/agent.js';
import type { CliArgs } from '../types.js';

/** Model aliases */
export const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-3-5-20241022',
};

/** Tools that require explicit user approval */
export const APPROVAL_REQUIRED_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

/**
 * Build query options without undefined values
 */
export function buildQueryOptions(
  args: CliArgs,
  extras: {
    systemPrompt?: string;
    tools?: string[];
    allowedTools?: string[];
    includePartialMessages?: boolean;
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
    canUseTool?: (toolName: string, input: Record<string, unknown>) => Promise<PermissionResult>;
    resume?: string;
  } = {}
) {
  const opts: Parameters<typeof query>[1] = {};

  if (args.model) {
    const modelId = MODEL_MAP[args.model];
    if (modelId) {
      opts.model = modelId;
    }
  }
  if (extras.systemPrompt) {
    opts.systemPrompt = extras.systemPrompt;
  }
  if (extras.tools) {
    opts.tools = extras.tools;
  }
  if (extras.allowedTools) {
    opts.allowedTools = extras.allowedTools;
  }
  if (extras.includePartialMessages !== undefined) {
    opts.includePartialMessages = extras.includePartialMessages;
  }
  if (extras.permissionMode !== undefined) {
    opts.permissionMode = extras.permissionMode;
  }
  if (extras.canUseTool) {
    opts.canUseTool = extras.canUseTool;
  }
  if (extras.resume) {
    opts.resume = extras.resume;
  }

  return opts;
}
