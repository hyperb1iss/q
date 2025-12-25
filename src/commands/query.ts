/**
 * Simple query command (non-agent mode)
 */

import type { SDKResultMessage } from '../lib/agent.js';
import { query, streamQuery } from '../lib/agent.js';
import { semantic, status } from '../lib/colors.js';
import { formatCost, formatTokens } from '../lib/format.js';
import { render as renderMarkdown } from '../lib/markdown.js';
import { buildSystemPrompt, getEnvironmentContext, type PromptMode } from '../lib/prompt.js';
import type { CliArgs, Config } from '../types.js';
import { buildQueryOptions } from './shared.js';

/**
 * Run a single query with streaming
 * @param promptMode - 'query' for direct questions, 'pipe' for pipeline processing
 */
export async function runQuery(
  prompt: string,
  args: CliArgs,
  _config: Config,
  promptMode: PromptMode = 'query'
): Promise<void> {
  const quiet = args.quiet ?? false;

  // Show thinking indicator
  if (!quiet) {
    process.stdout.write(semantic.muted(`${status.pending} Thinking...`));
  }

  try {
    if (args.stream) {
      // Streaming mode - use SDK's clean result.result field
      const systemPrompt = buildSystemPrompt(await getEnvironmentContext(), promptMode);
      const opts = buildQueryOptions(args, {
        systemPrompt,
        tools: [],
        includePartialMessages: false, // Don't need partial messages, just final result
      });

      for await (const message of streamQuery(prompt, opts)) {
        // Handle result - SDK provides clean response in result.result
        if (message.type === 'result') {
          const result = message as SDKResultMessage;

          // Clear thinking indicator
          if (!quiet) {
            process.stdout.write('\r\x1b[K');
          }

          // Get response and filter out XML tool blocks
          const rawText =
            result.subtype === 'success' && 'result' in result
              ? (result as { result: string }).result
              : '';

          // Filter out XML tool calls that leak through
          const responseText = rawText
            .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          // Render markdown unless --raw
          if (args.raw) {
            console.log(responseText);
          } else {
            const rendered = await renderMarkdown(responseText);
            console.log(rendered);
          }

          // Only show stats with --verbose
          if (args.verbose) {
            const tokens = formatTokens(result.usage.input_tokens, result.usage.output_tokens);
            const cost = formatCost(result.total_cost_usd);
            console.log(
              semantic.muted(
                `${status.success} ${tokens} tokens | ${cost} | ${args.model ?? 'sonnet'}`
              )
            );
          }
        }
      }
    } else {
      // Non-streaming mode - wait for complete response
      const systemPrompt = buildSystemPrompt(await getEnvironmentContext(), promptMode);
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

        // Only show stats with --verbose
        if (args.verbose) {
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
