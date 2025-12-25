/**
 * Simple query command (non-agent mode)
 */

import type { SDKAssistantMessage, SDKResultMessage } from '../lib/agent.js';
import { query, streamQuery } from '../lib/agent.js';
import { semantic, status } from '../lib/colors.js';
import { formatCost, formatTokens } from '../lib/format.js';
import { render as renderMarkdown } from '../lib/markdown.js';
import { buildSystemPrompt, getEnvironmentContext } from '../lib/prompt.js';
import type { CliArgs, Config } from '../types.js';
import { buildQueryOptions } from './shared.js';

/**
 * Run a single query with streaming
 */
export async function runQuery(prompt: string, args: CliArgs, _config: Config): Promise<void> {
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
            semantic.muted(`${status.success} ${tokens} tokens | ${cost} | ${args.model ?? 'sonnet'}`)
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
            semantic.muted(`${status.success} ${tokens} tokens | ${cost} | ${args.model ?? 'sonnet'}`)
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
    console.error(semantic.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}
