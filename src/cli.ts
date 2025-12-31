#!/usr/bin/env bun

/**
 * q - The Shell's Quiet Companion
 *
 * Elegant CLI agent for quick queries with Claude.
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runAgent, runInteractive, runPipe, runQuery, showSessions } from './commands/index.js';
import { color, semantic, setColorMode } from './lib/colors.js';
import { loadQConfig } from './lib/config.js';
import { getLastSession, getSession } from './lib/storage.js';
import type { CliArgs, Mode } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')) as {
  version: string;
};
const VERSION = pkg.version;

/** Default max input size if not configured */
const DEFAULT_MAX_INPUT_SIZE = 100000;

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Build file context with metadata only
 * Claude can use Read tool if it needs actual content
 */
function readFileContext(files: string[]): string {
  const blocks: string[] = [];

  for (const filePath of files) {
    try {
      const name = filePath.split('/').pop() ?? filePath;
      const stats = statSync(filePath);
      const size = formatFileSize(stats.size);

      blocks.push(
        `<file name="${name}" path="${filePath}" size="${size}">\n` +
          `[File reference - use this exact filename in commands]\n</file>`
      );
    } catch (error) {
      console.error(
        semantic.error(
          `Cannot read file: ${filePath} - ${error instanceof Error ? error.message : 'Unknown error'}`
        )
      );
      process.exit(1);
    }
  }

  return blocks.length > 0 ? `<context>\n${blocks.join('\n\n')}\n</context>\n\n` : '';
}

/**
 * Validate input size against configured limits
 */
function validateInputSize(
  input: string,
  maxSize: number
): { valid: true } | { valid: false; message: string } {
  if (input.length > maxSize) {
    const sizeKB = Math.round(input.length / 1024);
    const maxKB = Math.round(maxSize / 1024);
    return {
      valid: false,
      message: `Input too large: ${sizeKB}KB exceeds limit of ${maxKB}KB`,
    };
  }
  return { valid: true };
}

/**
 * Expand prompt aliases in query
 * Aliases are prefixed with @ (e.g., "@review" -> "Review this code for issues")
 */
function expandAliases(query: string, prompts: Record<string, string>): string {
  // Match @alias at start of query or standalone
  const aliasMatch = query.match(/^@(\w+)(?:\s+(.*))?$/);
  if (!aliasMatch) return query;

  const alias = aliasMatch[1];
  const rest = aliasMatch[2];

  if (!alias) return query;

  const expansion = prompts[alias];
  if (!expansion) {
    // Unknown alias - return as-is (user might mean literal @)
    return query;
  }

  // If there's additional text after alias, append it
  return rest ? `${expansion} ${rest}` : expansion;
}

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
    .option('dry-run', {
      type: 'boolean',
      describe: 'Show what tools would be called without executing (use with -x)',
    })
    .option('resume', {
      alias: 'r',
      type: 'string',
      describe: 'Resume a previous session (use "last" for most recent)',
    })
    .option('continue', {
      alias: 'c',
      type: 'boolean',
      describe: 'Continue the last session (shortcut for --resume last)',
    })
    .option('no-config', {
      type: 'boolean',
      describe: 'Skip loading config files (security: prevents code execution)',
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
    .option('verbose', {
      alias: 'v',
      type: 'boolean',
      describe: 'Show token/cost stats',
    })
    .option('raw', {
      type: 'boolean',
      describe: 'Raw output without markdown formatting',
    })
    .option('json', {
      type: 'boolean',
      describe: 'Output response as JSON',
    })
    .option('file', {
      alias: 'f',
      type: 'array',
      string: true,
      describe: 'Include file(s) as context',
    })
    .option('shell-init', {
      type: 'string',
      choices: ['bash', 'zsh', 'fish'] as const,
      describe: 'Output shell integration script for sourcing',
    })
    .option('color', {
      type: 'string',
      choices: ['auto', 'always', 'never'] as const,
      default: 'auto',
      describe: 'Color output mode (respects NO_COLOR env var)',
    })
    .example('$0 "what does this error mean"', 'Quick query')
    .example('cat error.log | $0 "explain this"', 'Pipe mode')
    .example('$0 -f src/index.ts "explain this"', 'Include file as context')
    .example('$0 "@review src/app.ts"', 'Use prompt alias from config')
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
  const stdinIsTTY = process.stdin.isTTY;

  if (args.interactive) return 'interactive';
  if (args.execute) return 'execute';
  // File references imply agent mode (need tools to work with files)
  if (args.file?.length) return 'execute';
  if (!stdinIsTTY) return 'pipe';
  if (args.query) return 'query';
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
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs();
  const config = await loadQConfig({ skipLoad: args.noConfig ?? false });
  const mode = detectMode(args);

  // When stdout is piped, auto-enable clean output mode
  const stdoutIsPiped = !process.stdout.isTTY;
  if (stdoutIsPiped) {
    args.quiet = true;
    args.raw = true;
    args.color = 'never';
  }

  // Set color mode early (before any output)
  if (args.color) {
    setColorMode(args.color);
  }

  // Apply config defaults if not specified via CLI
  if (!args.model && config.model) {
    args.model = config.model;
  }

  // Debug logging
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

  // Handle --continue flag (shortcut for --resume last)
  if (args.continue) {
    args.resume = 'last';
  }

  // Handle --resume flag
  if (args.resume) {
    const session = args.resume === 'last' ? getLastSession() : getSession(String(args.resume));
    if (!session) {
      console.error(semantic.error('Session not found'));
      console.log(semantic.muted('Use --sessions to list available sessions'));
      process.exit(1);
    }

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

    const prompt = await promptForContinuation();
    if (!prompt) {
      console.log(semantic.muted('No message provided, exiting'));
      return;
    }

    await runAgent(prompt, args, config, {
      id: session.id,
      sdkSessionId: session.sdkSessionId,
    });
    return;
  }

  // Get max input size from config
  const maxInputSize = config.safety?.maxInputSize ?? DEFAULT_MAX_INPUT_SIZE;

  // Dispatch to appropriate command
  switch (mode) {
    case 'query': {
      if (!args.query) {
        console.error(semantic.error('No query provided'));
        process.exit(1);
      }
      const fileContext = args.file ? readFileContext(args.file) : '';
      const expandedQuery = expandAliases(args.query, config.prompts);
      const fullPrompt = fileContext + expandedQuery;
      const validation = validateInputSize(fullPrompt, maxInputSize);
      if (!validation.valid) {
        console.error(semantic.error(validation.message));
        process.exit(1);
      }
      await runQuery(fullPrompt, args, config, 'query');
      break;
    }

    case 'pipe': {
      const stdin = await readStdin();
      const basePrompt = args.query ?? 'Analyze this:';
      const expandedPrompt = expandAliases(basePrompt, config.prompts);
      const fullPrompt = `<piped_input>\n${stdin.trim()}\n</piped_input>\n\n${expandedPrompt}`;
      const validation = validateInputSize(fullPrompt, maxInputSize);
      if (!validation.valid) {
        console.error(semantic.error(validation.message));
        process.exit(1);
      }
      await runPipe(fullPrompt, args, config);
      break;
    }

    case 'interactive': {
      await runInteractive(args, config);
      break;
    }

    case 'execute': {
      if (!args.query) {
        console.error(semantic.error('No task provided for execute mode'));
        process.exit(1);
      }
      const fileContext = args.file ? readFileContext(args.file) : '';
      const expandedQuery = expandAliases(args.query, config.prompts);
      const fullPrompt = fileContext + expandedQuery;
      const validation = validateInputSize(fullPrompt, maxInputSize);
      if (!validation.valid) {
        console.error(semantic.error(validation.message));
        process.exit(1);
      }
      await runAgent(fullPrompt, args, config);
      break;
    }
  }
}

// Run the CLI
main().catch(error => {
  console.error(semantic.error(`Fatal error: ${error.message}`));
  process.exit(1);
});
