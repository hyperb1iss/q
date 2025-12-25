#!/usr/bin/env bun
/**
 * q - The Shell's Quiet Companion
 *
 * Elegant CLI agent for quick queries with Claude.
 */

import * as readline from 'node:readline';
import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { SDKAssistantMessage, SDKResultMessage, SDKSystemMessage } from './lib/agent.js';
import { query, streamQuery } from './lib/agent.js';
import { color, semantic, status } from './lib/colors.js';
import { loadQConfig } from './lib/config.js';
import { render as renderMarkdown } from './lib/markdown.js';
import {
  AUTO_APPROVED_TOOLS,
  buildSystemPrompt,
  getEnvironmentContext,
  INTERACTIVE_TOOLS,
} from './lib/prompt.js';
import {
  addMessage,
  createSession,
  getLastSession,
  getSession,
  listSessions,
  updateSdkSessionId,
  updateSessionStats,
} from './lib/storage.js';
import type { CliArgs, Config, Mode } from './types.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Tools that require explicit user approval */
const APPROVAL_REQUIRED_TOOLS = ['Bash', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

const VERSION = '0.1.0';

/** Model aliases */
const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-20250514',
  opus: 'claude-opus-4-20250514',
  haiku: 'claude-haiku-3-5-20241022',
};

/**
 * Parse CLI arguments
 */
function parseArgs(): CliArgs {
  return yargs(hideBin(process.argv))
    .scriptName('q')
    .usage('$0 [query]', 'Ask Claude a question')
    .positional('query', {
      type: 'string',
      describe: 'The question or prompt',
    })
    .option('interactive', {
      alias: 'i',
      type: 'boolean',
      describe: 'Open interactive TUI mode',
    })
    .option('execute', {
      alias: 'x',
      type: 'boolean',
      describe:
        'Agent mode with tools (Read, Glob, Grep auto-approved; Bash, Write, Edit require confirmation)',
    })
    .option('resume', {
      alias: 'r',
      type: 'string',
      describe: 'Resume a previous session (use "last" for most recent)',
    })
    .option('sessions', {
      type: 'boolean',
      describe: 'List recent sessions',
    })
    .option('model', {
      alias: 'm',
      type: 'string',
      choices: ['sonnet', 'opus', 'haiku'] as const,
      describe: 'Model to use',
    })
    .option('stream', {
      alias: 's',
      type: 'boolean',
      default: true,
      describe: 'Stream response (disable with --no-stream)',
    })
    .option('quiet', {
      alias: 'q',
      type: 'boolean',
      describe: 'Minimal output (response only)',
    })
    .option('raw', {
      type: 'boolean',
      describe: 'Raw output without markdown formatting',
    })
    .option('shell-init', {
      type: 'string',
      choices: ['bash', 'zsh', 'fish'] as const,
      describe: 'Output shell integration script for sourcing',
    })
    .example('$0 "what does this error mean"', 'Quick query')
    .example('cat error.log | $0 "explain this"', 'Pipe mode')
    .example('$0 -i', 'Interactive mode')
    .example('$0 -x "find all TODO comments"', 'Agent mode (read-only)')
    .example('$0 -x "refactor to use async/await"', 'Agent mode (with edits)')
    .version(VERSION)
    .help()
    .parseSync() as CliArgs;
}

/**
 * Detect the invocation mode based on arguments and environment
 */
function detectMode(args: CliArgs): Mode {
  // Check if stdin is a TTY (interactive terminal)
  const stdinIsTTY = process.stdin.isTTY;

  if (args.interactive) {
    return 'interactive';
  }

  if (args.execute) {
    return 'execute';
  }

  // If stdin is not a TTY, we're in pipe mode (even if we also have a query)
  if (!stdinIsTTY) {
    return 'pipe';
  }

  // If we have a query, it's a quick query
  if (args.query) {
    return 'query';
  }

  // Default to interactive if no query and stdin is TTY
  return 'interactive';
}

/**
 * Read all data from stdin
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Format token count nicely
 */
function formatTokens(input: number, output: number): string {
  const total = input + output;
  if (total < 1000) return `${total}`;
  if (total < 10000) return `${(total / 1000).toFixed(1)}k`;
  return `${Math.round(total / 1000)}k`;
}

/**
 * Format cost nicely
 */
function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 0.1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Format relative time
 */
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Output shell integration script for the specified shell
 */
function outputShellInit(shell: 'bash' | 'zsh' | 'fish'): void {
  const shellDir = join(__dirname, '..', 'shell');
  const scriptPath = join(shellDir, `q.${shell}`);

  try {
    const script = readFileSync(scriptPath, 'utf-8');
    console.log(script);
  } catch {
    // Fallback: try relative to dist directory
    const distShellDir = join(__dirname, '..', '..', 'shell');
    const distScriptPath = join(distShellDir, `q.${shell}`);
    try {
      const script = readFileSync(distScriptPath, 'utf-8');
      console.log(script);
    } catch {
      console.error(semantic.error(`Shell integration script not found for ${shell}`));
      console.error(semantic.muted(`Looked in: ${scriptPath} and ${distScriptPath}`));
      process.exit(1);
    }
  }
}

/**
 * Show recent sessions
 */
function showSessions(): void {
  const sessions = listSessions(10);

  if (sessions.length === 0) {
    console.log(semantic.muted('No sessions yet'));
    return;
  }

  console.log();
  console.log(color('Recent sessions', 'purple', 'bold'));
  console.log(semantic.muted('─'.repeat(60)));

  for (const s of sessions) {
    const title = s.title ?? semantic.muted('(untitled)');
    const time = formatRelativeTime(s.updatedAt);
    const cost = formatCost(s.totalCost);

    console.log(`  ${color(s.id, 'cyan')} ${title}`);
    console.log(`    ${semantic.muted(`${s.messageCount} msgs │ ${cost} │ ${s.model} │ ${time}`)}`);
  }

  console.log();
  console.log(semantic.muted('Resume with: q -r <id> or q -r last'));
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Load config first
  const config = await loadQConfig();

  const args = parseArgs();
  const mode = detectMode(args);

  // Apply config defaults if not specified via CLI
  if (!args.model && config.model) {
    args.model = config.model;
  }

  // Show startup info in development
  if (process.env.DEBUG) {
    console.error(semantic.muted(`[debug] mode=${mode} args=${JSON.stringify(args)}`));
    console.error(semantic.muted(`[debug] config=${JSON.stringify(config)}`));
  }

  // Handle --shell-init flag (early exit)
  if (args.shellInit) {
    outputShellInit(args.shellInit as 'bash' | 'zsh' | 'fish');
    return;
  }

  // Handle --sessions flag
  if (args.sessions) {
    showSessions();
    return;
  }

  // Validate API key before any queries
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(semantic.error('Missing ANTHROPIC_API_KEY environment variable'));
    console.log();
    console.log('Set your Anthropic API key:');
    console.log(color('  export ANTHROPIC_API_KEY="sk-ant-..."', 'cyan'));
    console.log();
    console.log(semantic.muted('Get your API key at: https://console.anthropic.com/settings/keys'));
    console.log(semantic.muted('Add to ~/.zshrc or ~/.bashrc to persist across sessions.'));
    process.exit(1);
  }

  // Handle --resume flag
  if (args.resume) {
    const session = args.resume === 'last' ? getLastSession() : getSession(String(args.resume));
    if (!session) {
      console.error(semantic.error('Session not found'));
      console.log(semantic.muted('Use --sessions to list available sessions'));
      process.exit(1);
    }

    // Check if we have an SDK session ID to resume
    if (!session.sdkSessionId) {
      console.error(semantic.error('Session cannot be resumed (no SDK session ID)'));
      console.log(semantic.muted('This session was created before resume support was added'));
      process.exit(1);
    }

    console.log(semantic.info(`Resuming session ${session.id}`));
    console.log(
      semantic.muted(`${session.messages.length} messages, ${session.totalTokens} tokens`)
    );
    console.log();

    // Show last few messages for context
    for (const msg of session.messages.slice(-4)) {
      const prefix = msg.role === 'user' ? color('›', 'cyan') : color('◆', 'green');
      console.log(`${prefix} ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}`);
    }
    console.log();

    // Prompt for continuation message
    const prompt = await promptForContinuation();
    if (!prompt) {
      console.log(semantic.muted('No message provided, exiting'));
      return;
    }

    // Resume the agent session
    await runAgent(prompt, args, config, {
      id: session.id,
      sdkSessionId: session.sdkSessionId,
    });
    return;
  }

  switch (mode) {
    case 'query': {
      // Quick query mode
      if (!args.query) {
        console.error(semantic.error('No query provided'));
        process.exit(1);
      }
      await runQuery(args.query, args, config);
      break;
    }

    case 'pipe': {
      // Pipe mode - read stdin as context
      const stdin = await readStdin();
      const prompt = args.query ?? 'Explain this:';
      const fullPrompt = `<context>\n${stdin.trim()}\n</context>\n\n${prompt}`;
      await runQuery(fullPrompt, args, config);
      break;
    }

    case 'interactive': {
      // Interactive TUI mode
      await runInteractive(args, config);
      break;
    }

    case 'execute': {
      // Agent mode with tools
      if (!args.query) {
        console.error(semantic.error('No task provided for execute mode'));
        process.exit(1);
      }
      await runAgent(args.query, args, config);
      break;
    }
  }
}

/**
 * Build query options without undefined values
 */
function buildQueryOptions(
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

/**
 * Run a single query with streaming
 */
async function runQuery(prompt: string, args: CliArgs, _config: Config): Promise<void> {
  const quiet = args.quiet ?? false;

  // Show thinking indicator
  if (!quiet) {
    process.stdout.write(semantic.muted(`${status.pending} Thinking...`));
  }

  let startedOutput = false;

  try {
    if (args.stream) {
      // Streaming mode - show output as it arrives
      let lastText = '';
      const systemPrompt = buildSystemPrompt(await getEnvironmentContext());
      const opts = buildQueryOptions(args, {
        systemPrompt,
        tools: [],
        includePartialMessages: true,
      });

      for await (const message of streamQuery(prompt, opts)) {
        // Handle assistant text
        if (message.type === 'assistant') {
          const assistantMsg = message as SDKAssistantMessage;
          for (const block of assistantMsg.message.content) {
            if ('text' in block && block.text && block.text !== lastText) {
              if (!startedOutput) {
                // Clear the "Thinking..." line
                if (!quiet) {
                  process.stdout.write('\r\x1b[K');
                }
                startedOutput = true;
              }
              // Write incremental text
              const newText = block.text.slice(lastText.length);
              process.stdout.write(newText);
              lastText = block.text;
            }
          }
        }

        // Handle result for stats
        if (message.type === 'result' && !quiet) {
          const result = message as SDKResultMessage;
          const tokens = formatTokens(result.usage.input_tokens, result.usage.output_tokens);
          const cost = formatCost(result.total_cost_usd);

          // Add newline after response, then show stats
          if (startedOutput) {
            console.log();
          }
          console.log(
            semantic.muted(
              `${status.success} ${tokens} tokens | ${cost} | ${args.model ?? 'sonnet'}`
            )
          );
        }
      }
    } else {
      // Non-streaming mode - wait for complete response
      const systemPrompt = buildSystemPrompt(await getEnvironmentContext());
      const opts = buildQueryOptions(args, { systemPrompt, tools: [] });
      const result = await query(prompt, opts);

      // Clear thinking indicator
      if (!quiet) {
        process.stdout.write('\r\x1b[K');
      }

      if (result.success) {
        // Render markdown unless --raw is specified
        if (args.raw) {
          console.log(result.response);
        } else {
          const rendered = await renderMarkdown(result.response);
          console.log(rendered);
        }

        if (!quiet) {
          const tokens = formatTokens(result.tokens.input, result.tokens.output);
          const cost = formatCost(result.cost);
          console.log(
            semantic.muted(
              `${status.success} ${tokens} tokens | ${cost} | ${args.model ?? 'sonnet'}`
            )
          );
        }
      } else {
        console.error(semantic.error(`Error: ${result.errorType}`));
        if (result.errors) {
          for (const err of result.errors) {
            console.error(semantic.error(`  ${err}`));
          }
        }
        process.exit(1);
      }
    }
  } catch (error) {
    // Clear thinking indicator
    process.stdout.write('\r\x1b[K');
    console.error(
      semantic.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    );
    process.exit(1);
  }
}

/**
 * Run interactive TUI mode
 */
async function runInteractive(args: CliArgs, _config: Config): Promise<void> {
  const { render } = await import('ink');
  const React = await import('react');
  const { App } = await import('./components/index.js');

  const props: { model?: string } = {};
  if (args.model) {
    const modelId = MODEL_MAP[args.model];
    if (modelId) {
      props.model = modelId;
    }
  }

  render(React.createElement(App, props));
}

/**
 * Prompt user for a continuation message when resuming a session
 */
async function promptForContinuation(): Promise<string | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<string | null>(resolve => {
    rl.question(`${color('›', 'cyan')} `, answer => {
      rl.close();
      const trimmed = answer.trim();
      return resolve(trimmed || null);
    });
  });
}

/**
 * Prompt user for tool approval via CLI
 */
async function promptToolApproval(
  toolName: string,
  input: Record<string, unknown>
): Promise<{ approved: boolean; message?: string }> {
  // Format the tool info for display
  const toolDisplay = color(toolName, 'coral', 'bold');
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
  console.log(`${status.warning} ${toolDisplay} wants to execute:${inputDisplay}`);
  console.log();

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<{ approved: boolean; message?: string }>(resolve => {
    rl.question(
      `${semantic.muted('Allow?')} ${color('[y]es', 'green')} / ${color('[n]o', 'red')} / ${color('[a]lways', 'yellow')}: `,
      answer => {
        rl.close();
        const lower = answer.toLowerCase().trim();
        if (lower === 'y' || lower === 'yes' || lower === '') {
          return resolve({ approved: true });
        }
        if (lower === 'a' || lower === 'always') {
          return resolve({ approved: true, message: 'always' });
        }
        return resolve({ approved: false, message: 'User denied' });
      }
    );
  });
}

/**
 * Format a tool call for display
 */
function formatToolCall(toolName: string, input: Record<string, unknown>): string {
  const toolColor = color(toolName, 'coral', 'bold');

  // Format input based on tool type
  let inputSummary = '';
  switch (toolName) {
    case 'Read':
      inputSummary = input.file_path as string;
      break;
    case 'Glob':
      inputSummary = `${input.pattern}${input.path ? ` in ${input.path}` : ''}`;
      break;
    case 'Grep':
      inputSummary = `"${input.pattern}"${input.path ? ` in ${input.path}` : ''}`;
      break;
    case 'Bash':
      inputSummary =
        (input.command as string).slice(0, 60) +
        ((input.command as string).length > 60 ? '...' : '');
      break;
    case 'Write':
    case 'Edit':
      inputSummary = input.file_path as string;
      break;
    default:
      inputSummary = JSON.stringify(input).slice(0, 60);
  }

  return `  ${status.tool} ${toolColor} ${semantic.muted(inputSummary)}`;
}

/**
 * Run agent mode with tools (streaming)
 */
async function runAgent(
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
    console.log(semantic.muted('─'.repeat(60)));
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

    // Default: allow unknown tools (SDK handles them)
    return { behavior: 'allow', updatedInput: input };
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

        if (!quiet) {
          const tokens = formatTokens(result.usage.input_tokens, result.usage.output_tokens);
          const cost = formatCost(result.total_cost_usd);

          console.log();
          console.log(semantic.muted('─'.repeat(60)));
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
    console.error(
      semantic.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    );
    process.exit(1);
  }
}

// Run the CLI
main().catch(error => {
  console.error(semantic.error(`Fatal error: ${error.message}`));
  process.exit(1);
});
