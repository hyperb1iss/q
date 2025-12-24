#!/usr/bin/env bun
/**
 * q - The Shell's Quiet Companion
 *
 * Elegant CLI agent for quick queries with Claude.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import type { SDKAssistantMessage, SDKResultMessage } from './lib/agent.js';
import { query, streamQuery } from './lib/agent.js';
import { color, semantic, status } from './lib/colors.js';
import { render as renderMarkdown } from './lib/markdown.js';
import type { CliArgs, Mode } from './types.js';

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
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();
  const mode = detectMode(args);

  // Show startup info in development
  if (process.env.DEBUG) {
    console.error(semantic.muted(`[debug] mode=${mode} args=${JSON.stringify(args)}`));
  }

  switch (mode) {
    case 'query': {
      // Quick query mode
      if (!args.query) {
        console.error(semantic.error('No query provided'));
        process.exit(1);
      }
      await runQuery(args.query, args);
      break;
    }

    case 'pipe': {
      // Pipe mode - read stdin as context
      const stdin = await readStdin();
      const prompt = args.query ?? 'Explain this:';
      const fullPrompt = `<context>\n${stdin.trim()}\n</context>\n\n${prompt}`;
      await runQuery(fullPrompt, args);
      break;
    }

    case 'interactive': {
      // Interactive TUI mode
      await runInteractive(args);
      break;
    }

    case 'execute': {
      // Agent mode with tools
      if (!args.query) {
        console.error(semantic.error('No task provided for execute mode'));
        process.exit(1);
      }
      await runAgent(args.query, args);
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
    tools?: string[];
    allowedTools?: string[];
    includePartialMessages?: boolean;
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  } = {}
) {
  const opts: Parameters<typeof query>[1] = {};

  if (args.model) {
    const modelId = MODEL_MAP[args.model];
    if (modelId) {
      opts.model = modelId;
    }
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

  return opts;
}

/**
 * Run a single query with streaming
 */
async function runQuery(prompt: string, args: CliArgs): Promise<void> {
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
      const opts = buildQueryOptions(args, { tools: [], includePartialMessages: true });

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
      const opts = buildQueryOptions(args, { tools: [] });
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
async function runInteractive(args: CliArgs): Promise<void> {
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

  return `${color('⚡', 'yellow')} ${toolColor} ${semantic.muted(inputSummary)}`;
}

/**
 * Run agent mode with tools (streaming)
 */
async function runAgent(task: string, args: CliArgs): Promise<void> {
  const quiet = args.quiet ?? false;

  if (!quiet) {
    console.log(color(`${status.active} Agent mode`, 'purple', 'bold'));
    console.log(semantic.muted('─'.repeat(40)));
    console.log();
  }

  let lastText = '';
  let startedOutput = false;
  let toolCount = 0;

  try {
    // Agent mode - enable common tools, auto-approve read-only ones
    const opts = buildQueryOptions(args, {
      allowedTools: ['Read', 'Glob', 'Grep'], // Auto-approved (read-only)
      tools: ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit'], // Available tools
      includePartialMessages: true,
      permissionMode: 'default', // Require approval for write ops
    });

    for await (const message of streamQuery(task, opts)) {
      // Handle tool use
      if (message.type === 'assistant') {
        const assistantMsg = message as SDKAssistantMessage;
        for (const block of assistantMsg.message.content) {
          // Show tool calls
          if ('type' in block && block.type === 'tool_use') {
            const toolBlock = block as {
              type: 'tool_use';
              name: string;
              input: Record<string, unknown>;
            };
            if (!quiet) {
              console.log(formatToolCall(toolBlock.name, toolBlock.input));
            }
            toolCount++;
          }

          // Stream text output
          if ('text' in block && block.text && block.text !== lastText) {
            if (!startedOutput && !quiet) {
              console.log();
              startedOutput = true;
            }
            const newText = block.text.slice(lastText.length);
            process.stdout.write(newText);
            lastText = block.text;
          }
        }
      }

      // Handle result
      if (message.type === 'result' && !quiet) {
        const result = message as SDKResultMessage;
        const tokens = formatTokens(result.usage.input_tokens, result.usage.output_tokens);
        const cost = formatCost(result.total_cost_usd);

        if (startedOutput) {
          console.log();
        }
        console.log();
        console.log(semantic.muted('─'.repeat(40)));
        console.log(
          semantic.muted(
            `${status.success} ${tokens} tokens | ${cost} | ${args.model ?? 'sonnet'} | ${result.num_turns} turns | ${toolCount} tools`
          )
        );
      }
    }
  } catch (error) {
    if (startedOutput) {
      console.log();
    }
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
