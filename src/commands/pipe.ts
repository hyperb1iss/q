/**
 * Pipe mode - tools available, non-chatty output, auto-approve read-only tools
 *
 * Outputs directly to stdout, exits with appropriate status code.
 * Perfect Unix citizen for pipelines.
 */

import type { PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import type { SDKAssistantMessage, SDKResultMessage } from '../lib/agent.js';
import { streamQuery } from '../lib/agent.js';
import {
  AUTO_APPROVED_TOOLS,
  buildSystemPrompt,
  getEnvironmentContext,
  INTERACTIVE_TOOLS,
} from '../lib/prompt.js';
import type { CliArgs, Config } from '../types.js';
import { buildQueryOptions } from './shared.js';

/**
 * Run pipe mode with tools (streaming, non-interactive)
 * - Read-only tools auto-approved
 * - Write tools denied (can't prompt in pipeline)
 * - Non-chatty output via PIPE_PROMPT
 * - Returns exit code: 0 = success, 1 = error
 */
export async function runPipe(prompt: string, args: CliArgs, _config: Config): Promise<void> {
  // Permission handler: allow read-only, deny write operations
  const canUseTool = async (
    toolName: string,
    input: Record<string, unknown>
  ): Promise<PermissionResult> => {
    if (AUTO_APPROVED_TOOLS.includes(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }
    // Deny write tools in pipe mode - can't prompt for approval
    return { behavior: 'deny', message: 'Write operations not allowed in pipe mode' };
  };

  try {
    const systemPrompt = buildSystemPrompt(await getEnvironmentContext(), 'pipe');
    const opts = buildQueryOptions(args, {
      systemPrompt,
      tools: INTERACTIVE_TOOLS, // Read, Glob, Grep, Bash (Bash will be denied)
      includePartialMessages: false,
      canUseTool,
    });

    let responseText = '';
    let success = false;

    for await (const message of streamQuery(prompt, opts)) {
      // Collect text from assistant messages
      if (message.type === 'assistant') {
        const assistantMsg = message as SDKAssistantMessage;
        for (const block of assistantMsg.message.content) {
          if ('text' in block && block.text) {
            responseText = block.text;
          }
        }
      }

      // Output final result
      if (message.type === 'result') {
        const result = message as SDKResultMessage;
        success = result.subtype === 'success';

        if (success) {
          // Get clean response text
          const finalText =
            'result' in result ? (result as { result: string }).result : responseText;

          // Clean up output for pipeline use
          const cleanText = finalText
            // Remove XML tool call leakage
            .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '')
            // Strip markdown code blocks (```lang\n...\n```)
            .replace(/^```\w*\n?/gm, '')
            .replace(/\n?```$/gm, '')
            // Remove excessive newlines
            .replace(/\n{3,}/g, '\n\n')
            .trim();

          // Output to stdout
          if (cleanText) {
            console.log(cleanText);
          }
        } else {
          // Error - output to stderr
          const errorMsg = 'error' in result ? String(result.error) : 'Request failed';
          console.error(errorMsg);
        }
      }
    }

    process.exit(success ? 0 : 1);
  } catch (error) {
    // Errors go to stderr
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
