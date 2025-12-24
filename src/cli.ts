#!/usr/bin/env bun
/**
 * q - The Shell's Quiet Companion
 *
 * Elegant CLI agent for quick queries with Claude.
 */

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { color, semantic, status } from './lib/colors.js';
import type { CliArgs, Mode } from './types.js';

const VERSION = '0.1.0';

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
      describe: 'Enable agent tools (Read, Glob, Grep, Bash)',
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
    .example('$0 "what does this error mean"', 'Quick query')
    .example('cat error.log | $0 "explain this"', 'Pipe mode')
    .example('$0 -i', 'Interactive mode')
    .example('$0 -x "find all TODO comments"', 'Agent mode')
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

  // If stdin is not a TTY and we have no query, we're in pipe mode
  if (!stdinIsTTY && !args.query) {
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
 * Run a single query (non-interactive)
 */
async function runQuery(prompt: string, _args: CliArgs): Promise<void> {
  // TODO: Implement with Claude Agent SDK
  console.log(semantic.muted('Query mode - implementation pending'));
  console.log(color(`Prompt: ${prompt}`, 'cyan'));
  console.log();
  console.log(
    semantic.warning(
      'The Claude Agent SDK integration is not yet implemented.\n' +
        'This is a placeholder that will be replaced with actual streaming responses.'
    )
  );
  console.log();
  console.log(semantic.muted(`${status.pending} 0 tokens | sonnet`));
}

/**
 * Run interactive TUI mode
 */
async function runInteractive(_args: CliArgs): Promise<void> {
  // TODO: Implement with Ink
  console.log(semantic.muted('Interactive mode - implementation pending'));
  console.log();
  console.log(
    semantic.warning(
      'The Ink TUI is not yet implemented.\n' +
        'This will open a full-screen conversation interface.'
    )
  );
}

/**
 * Run agent mode with tools
 */
async function runAgent(task: string, _args: CliArgs): Promise<void> {
  // TODO: Implement with Claude Agent SDK + tool permissions
  console.log(semantic.muted('Agent mode - implementation pending'));
  console.log(color(`Task: ${task}`, 'cyan'));
  console.log();
  console.log(
    semantic.warning(
      'The agent mode is not yet implemented.\n' +
        'This will enable Read, Glob, Grep, and Bash tools with approval flow.'
    )
  );
}

// Run the CLI
main().catch(error => {
  console.error(semantic.error(`Fatal error: ${error.message}`));
  process.exit(1);
});
