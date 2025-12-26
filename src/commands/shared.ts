/**
 * Shared utilities for command modules
 */

import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { query } from '../lib/agent.js';
import { AUTO_APPROVED_TOOLS } from '../lib/prompt.js';
import type { CliArgs } from '../types.js';

/** Model aliases - Claude 4.5 latest */
export const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-5-20251101',
  haiku: 'claude-haiku-4-5-20251001',
};

/** Tools that require explicit user approval */
export const APPROVAL_REQUIRED_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

/** Options for creating a permission handler */
export interface PermissionHandlerOptions {
  /** When true, log tool calls but deny execution */
  dryRun?: boolean;
  /** Callback to log tool calls in dry-run mode */
  dryRunLogger?: (toolName: string, input: Record<string, unknown>) => void;
  /** Mode: 'prompt' for interactive approval, 'deny' for auto-deny writes */
  mode: 'prompt' | 'deny';
  /** Callback for prompting user approval (required when mode='prompt') */
  promptApproval?: (
    toolName: string,
    input: Record<string, unknown>
  ) => Promise<{ approved: boolean; message?: string }>;
  /** Set of tools the user has said "always approve" */
  alwaysApproved?: Set<string>;
}

/**
 * Create a permission handler for tool execution
 */
export function createPermissionHandler(options: PermissionHandlerOptions) {
  const { dryRun, dryRunLogger, mode, promptApproval, alwaysApproved } = options;

  return async (toolName: string, input: Record<string, unknown>): Promise<PermissionResult> => {
    // Dry-run mode: log and deny all tools
    if (dryRun && dryRunLogger) {
      dryRunLogger(toolName, input);
      return { behavior: 'deny', message: '[dry-run] Tool execution skipped' };
    }

    // Auto-approve read-only tools
    if (AUTO_APPROVED_TOOLS.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Check "always" approved set
    if (alwaysApproved?.has(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Handle write tools based on mode
    if (APPROVAL_REQUIRED_TOOLS.includes(toolName)) {
      if (mode === 'deny') {
        return { behavior: 'deny', message: 'Write operations not allowed in pipe mode' };
      }

      // Prompt mode - get user approval
      if (promptApproval) {
        const result = await promptApproval(toolName, input);
        if (result.approved) {
          if (result.message === 'always' && alwaysApproved) {
            alwaysApproved.add(toolName);
          }
          return { behavior: 'allow', updatedInput: input };
        }
        return { behavior: 'deny', message: result.message ?? 'User denied' };
      }
    }

    // Security: deny unknown tools by default
    return { behavior: 'deny', message: `Unknown tool: ${toolName}` };
  };
}

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
