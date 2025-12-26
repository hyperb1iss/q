/**
 * Agent mode with tools
 */

import * as readline from 'node:readline';
import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { SDKAssistantMessage, SDKResultMessage, SDKSystemMessage } from '../lib/agent.js';
import { streamQuery } from '../lib/agent.js';
import { color, semantic, status } from '../lib/colors.js';
import {
  formatCost,
  formatError,
  formatTokens,
  formatToolCall,
  SEPARATOR_WIDTH,
} from '../lib/format.js';
import { render as renderMarkdown } from '../lib/markdown.js';
import {
  AUTO_APPROVED_TOOLS,
  buildSystemPrompt,
  getEnvironmentContext,
  INTERACTIVE_TOOLS,
} from '../lib/prompt.js';
import {
  addMessage,
  createSession,
  updateSdkSessionId,
  updateSessionStats,
} from '../lib/storage.js';
import type { CliArgs, Config } from '../types.js';
import { APPROVAL_REQUIRED_TOOLS, buildQueryOptions, MODEL_MAP } from './shared.js';

/** Patterns that indicate high-risk commands */
const HIGH_RISK_PATTERNS = [
  /\brm\s+(-rf?|--recursive)/i,
  /\bsudo\b/i,
  /\bchmod\s+777\b/,
  /\b(dd|mkfs|fdisk)\b/i,
  />\s*\/dev\//,
  /\bkill\s+-9/,
  /\bgit\s+push\s+.*--force/i,
  /\bgit\s+reset\s+--hard/i,
];

/** Patterns that indicate medium-risk commands */
const MEDIUM_RISK_PATTERNS = [
  /\brm\b/i,
  /\bmv\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bgit\s+(push|reset|rebase)/i,
  /\bnpm\s+(publish|unpublish)/i,
  /\bcurl\b.*\|\s*(bash|sh)/i,
];

type RiskLevel = 'low' | 'medium' | 'high';

/**
 * Assess risk level of a tool call
 */
function assessRisk(
  toolName: string,
  input: Record<string, unknown>
): { level: RiskLevel; reason?: string } {
  if (toolName === 'Bash') {
    const cmd = String(input.command ?? '');

    for (const pattern of HIGH_RISK_PATTERNS) {
      if (pattern.test(cmd)) {
        return { level: 'high', reason: 'Potentially destructive command' };
      }
    }

    for (const pattern of MEDIUM_RISK_PATTERNS) {
      if (pattern.test(cmd)) {
        return { level: 'medium', reason: 'May modify files or system state' };
      }
    }

    return { level: 'low', reason: 'Runs a shell command' };
  }

  if (toolName === 'Write') {
    return { level: 'medium', reason: 'Creates or overwrites a file' };
  }

  if (toolName === 'Edit' || toolName === 'MultiEdit') {
    return { level: 'low', reason: 'Modifies existing file content' };
  }

  if (toolName === 'NotebookEdit') {
    return { level: 'low', reason: 'Modifies Jupyter notebook' };
  }

  return { level: 'low' };
}

/**
 * Format risk indicator for display
 */
function formatRisk(level: RiskLevel): string {
  switch (level) {
    case 'high':
      return color('HIGH RISK', 'red', 'bold');
    case 'medium':
      return color('MEDIUM', 'yellow');
    case 'low':
      return color('low', 'green');
  }
}

/**
 * Prompt user for tool approval via CLI
 */
async function promptToolApproval(
  toolName: string,
  input: Record<string, unknown>
): Promise<{ approved: boolean; message?: string }> {
  const risk = assessRisk(toolName, input);
  const toolDisplay = color(toolName, 'coral', 'bold');
  const riskDisplay = formatRisk(risk.level);

  let inputDisplay = '';
  switch (toolName) {
    case 'Bash':
      inputDisplay = `\n    ${semantic.muted('$')} ${color(String(input.command ?? ''), 'cyan')}`;
      break;
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      inputDisplay = `\n    ${semantic.muted('file:')} ${color(String(input.file_path ?? ''), 'cyan')}`;
      break;
    default:
      inputDisplay = `\n    ${semantic.muted(JSON.stringify(input, null, 2).split('\n').join('\n    '))}`;
  }

  console.log();
  console.log(
    `${status.warning} ${toolDisplay} ${semantic.muted('[')}${riskDisplay}${semantic.muted(']')}`
  );
  if (risk.reason) {
    console.log(`  ${semantic.muted(risk.reason)}`);
  }
  console.log(`  ${inputDisplay.trim()}`);
  console.log();

  // Extra confirmation for high-risk operations
  const prompt =
    risk.level === 'high'
      ? `${color('Careful!', 'red')} Allow? ${color('[y]es', 'green')} / ${color('[n]o', 'red')}: `
      : `${semantic.muted('Allow?')} ${color('[y]es', 'green')} / ${color('[n]o', 'red')} / ${color('[a]lways', 'yellow')}: `;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<{ approved: boolean; message?: string }>(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      const lower = answer.toLowerCase().trim();
      if (lower === 'y' || lower === 'yes') {
        return resolve({ approved: true });
      }
      // Only allow "always" for non-high-risk operations
      if (risk.level !== 'high' && (lower === 'a' || lower === 'always')) {
        return resolve({ approved: true, message: 'always' });
      }
      // Empty input defaults to yes only for low risk
      if (lower === '' && risk.level === 'low') {
        return resolve({ approved: true });
      }
      return resolve({ approved: false, message: 'User denied' });
    });
  });
}

/**
 * Run agent mode with tools (streaming)
 */
export async function runAgent(
  task: string,
  args: CliArgs,
  _config: Config,
  resumeSession?: { id: string; sdkSessionId: string }
): Promise<void> {
  const quiet = args.quiet ?? false;

  // Create session and save user message (unless resuming)
  const modelId = (args.model ? MODEL_MAP[args.model] : undefined) ?? 'claude-sonnet-4-20250514';
  const session = resumeSession ? { id: resumeSession.id } : createSession(modelId, process.cwd());
  addMessage(session.id, 'user', task);

  if (!quiet) {
    console.log();
    console.log(color(`${status.active} Agent mode`, 'purple', 'bold'));
    console.log(semantic.muted('─'.repeat(SEPARATOR_WIDTH)));
  }

  let fullText = '';
  let lastShownText = '';
  let toolCount = 0;
  let hasShownTools = false;
  const seenTools = new Set<string>();
  const alwaysApprovedTools = new Set<string>();

  // Custom permission handler for dangerous tools
  const canUseTool = async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> => {
    // Dry-run mode: show what would be called but don't execute
    if (args.dryRun) {
      console.log(formatToolCall(toolName, input));
      return { behavior: 'deny', message: '[dry-run] Tool execution skipped' };
    }

    // Auto-approve read-only tools
    if (AUTO_APPROVED_TOOLS.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Check if user said "always" for this tool
    if (alwaysApprovedTools.has(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Prompt for approval-required tools
    if (APPROVAL_REQUIRED_TOOLS.includes(toolName)) {
      const result = await promptToolApproval(toolName, input);
      if (result.approved) {
        if (result.message === 'always') {
          alwaysApprovedTools.add(toolName);
        }
        return { behavior: 'allow', updatedInput: input };
      }
      return { behavior: 'deny', message: result.message ?? 'User denied' };
    }

    // Security: deny unknown tools by default
    return { behavior: 'deny', message: `Unknown tool: ${toolName}` };
  };

  try {
    // Agent mode - enable common tools with custom permission handler
    const systemPrompt = buildSystemPrompt(await getEnvironmentContext());
    const queryExtras: Parameters<typeof buildQueryOptions>[1] = {
      systemPrompt,
      tools: [...INTERACTIVE_TOOLS, 'Write', 'Edit'],
      includePartialMessages: true,
      canUseTool,
    };
    if (resumeSession?.sdkSessionId) {
      queryExtras.resume = resumeSession.sdkSessionId;
    }
    const opts = buildQueryOptions(args, queryExtras);

    for await (const message of streamQuery(task, opts)) {
      // Capture SDK session ID from init message and store (for new sessions only)
      if (message.type === 'system') {
        const sysMsg = message as SDKSystemMessage;
        if (sysMsg.subtype === 'init' && sysMsg.session_id && !resumeSession) {
          updateSdkSessionId(session.id, sysMsg.session_id);
        }
      }
      // Handle tool use
      if (message.type === 'assistant') {
        const assistantMsg = message as SDKAssistantMessage;

        // First pass: show any text that appears before tools (announcement)
        for (const block of assistantMsg.message.content) {
          if ('text' in block && block.text) {
            fullText = block.text;
            // Show new text incrementally before tools appear
            if (!hasShownTools && fullText !== lastShownText) {
              const newText = fullText.slice(lastShownText.length);
              if (newText && !quiet) {
                process.stdout.write(newText);
              }
              lastShownText = fullText;
            }
          }
        }

        // Second pass: show tool calls
        for (const block of assistantMsg.message.content) {
          if ('type' in block && block.type === 'tool_use') {
            const toolBlock = block as {
              type: 'tool_use';
              name: string;
              input: Record<string, unknown>;
            };
            // Dedupe tool calls by name+input
            const toolKey = `${toolBlock.name}:${JSON.stringify(toolBlock.input)}`;
            if (!seenTools.has(toolKey)) {
              seenTools.add(toolKey);
              // Add newline before first tool if we showed announcement text
              if (!hasShownTools && lastShownText && !quiet) {
                console.log();
              }
              hasShownTools = true;
              if (!quiet) {
                console.log(formatToolCall(toolBlock.name, toolBlock.input));
              }
              toolCount++;
            }
          }
        }
      }

      // Handle result - render markdown and show stats
      if (message.type === 'result') {
        const result = message as SDKResultMessage;

        // Render the final text as markdown (skip announcement part we already showed)
        if (fullText && !quiet) {
          console.log();
          // If we showed tools, render full markdown response
          // If no tools, we already streamed the text - just add newline
          if (hasShownTools) {
            const rendered = await renderMarkdown(fullText);
            console.log(rendered);
          } else if (!lastShownText) {
            // No streaming happened, render now
            const rendered = await renderMarkdown(fullText);
            console.log(rendered);
          }
        }

        // Save assistant response to session
        const totalTokens = result.usage.input_tokens + result.usage.output_tokens;
        addMessage(session.id, 'assistant', fullText, totalTokens);
        updateSessionStats(
          session.id,
          totalTokens,
          result.total_cost_usd,
          task.slice(0, 50) // Use first 50 chars of task as title
        );

        // Only show stats with --verbose
        if (args.verbose) {
          const tokens = formatTokens(result.usage.input_tokens, result.usage.output_tokens);
          const cost = formatCost(result.total_cost_usd);

          console.log();
          console.log(semantic.muted('─'.repeat(SEPARATOR_WIDTH)));
          console.log(
            semantic.muted(
              `${status.success} ${tokens} tokens │ ${cost} │ ${args.model ?? 'sonnet'} │ ${result.num_turns} turns │ ${toolCount} tools`
            )
          );
          console.log(semantic.muted(`session: ${session.id}`));
        }
      }
    }
  } catch (error) {
    console.error(semantic.error(`Error: ${formatError(error)}`));
    process.exit(1);
  }
}
