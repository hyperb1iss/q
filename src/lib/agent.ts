/**
 * Claude Agent SDK Integration
 *
 * Uses the official @anthropic-ai/claude-agent-sdk for streaming agent responses.
 */

import type {
  PermissionMode,
  PermissionResult,
  SDKAssistantMessage,
  SDKMessage,
  Options as SDKOptions,
  SDKResultMessage,
  SDKSystemMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk';

export type { SDKMessage, SDKResultMessage, SDKAssistantMessage, SDKSystemMessage };

export interface QueryOptions {
  /** Working directory */
  cwd?: string;
  /** Model to use */
  model?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Append to system prompt */
  appendSystemPrompt?: string;
  /** Permission mode */
  permissionMode?: PermissionMode;
  /** Allowed tools (auto-approved without prompting) */
  allowedTools?: string[];
  /** Disallowed tools */
  disallowedTools?: string[];
  /** Restrict available tools to this list */
  tools?: string[];
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Maximum turns */
  maxTurns?: number;
  /** Include streaming partial messages */
  includePartialMessages?: boolean;
  /** Custom permission handler */
  canUseTool?: (toolName: string, input: Record<string, unknown>) => Promise<PermissionResult>;
  /** Callback for each streamed message */
  onMessage?: (message: SDKMessage) => void;
  /** Callback for text chunks (for immediate display) */
  onText?: (text: string) => void;
  /** Signal for cancellation */
  signal?: AbortSignal;
  /** Resume a previous session by SDK session ID */
  resume?: string;
}

export interface QueryResult {
  /** Final response text */
  response: string;
  /** Session ID for resumption */
  sessionId: string | undefined;
  /** Token usage */
  tokens: {
    input: number;
    output: number;
    cacheRead: number;
    cacheCreation: number;
  };
  /** Cost in USD */
  cost: number;
  /** Duration in ms */
  durationMs: number;
  /** Number of turns */
  numTurns: number;
  /** Whether the query completed successfully */
  success: boolean;
  /** Error subtype if failed */
  errorType: string | undefined;
  /** Error messages if failed */
  errors: string[] | undefined;
}

/**
 * Build SDK options without undefined values
 */
function buildSdkOptions(abortController: AbortController, options: QueryOptions): SDKOptions {
  const sdkOptions: SDKOptions = { abortController };

  if (options.cwd !== undefined) sdkOptions.cwd = options.cwd;
  if (options.model !== undefined) sdkOptions.model = options.model;
  if (options.permissionMode !== undefined) sdkOptions.permissionMode = options.permissionMode;
  if (options.allowedTools !== undefined) sdkOptions.allowedTools = options.allowedTools;
  if (options.disallowedTools !== undefined) sdkOptions.disallowedTools = options.disallowedTools;
  if (options.tools !== undefined) sdkOptions.tools = options.tools;
  if (options.maxBudgetUsd !== undefined) sdkOptions.maxBudgetUsd = options.maxBudgetUsd;
  if (options.maxTurns !== undefined) sdkOptions.maxTurns = options.maxTurns;
  if (options.includePartialMessages !== undefined) {
    sdkOptions.includePartialMessages = options.includePartialMessages;
  }

  // Handle system prompt
  if (options.systemPrompt) {
    sdkOptions.systemPrompt = options.systemPrompt;
  } else if (options.appendSystemPrompt) {
    sdkOptions.systemPrompt = {
      type: 'preset',
      preset: 'claude_code',
      append: options.appendSystemPrompt,
    };
  }

  // Custom permission handler
  if (options.canUseTool) {
    const userCanUseTool = options.canUseTool;
    sdkOptions.canUseTool = async (toolName, input, { signal }) => {
      if (signal.aborted) {
        return { behavior: 'deny', message: 'Operation cancelled' };
      }
      return userCanUseTool(toolName, input);
    };
  }

  // Resume a previous session
  if (options.resume !== undefined) {
    sdkOptions.resume = options.resume;
  }

  return sdkOptions;
}

/**
 * Query Claude using the Agent SDK
 */
export async function query(prompt: string, options: QueryOptions = {}): Promise<QueryResult> {
  const abortController = new AbortController();

  // Link external signal to our controller
  if (options.signal) {
    options.signal.addEventListener('abort', () => abortController.abort());
  }

  const sdkOptions = buildSdkOptions(abortController, options);

  let responseText = '';
  let sessionId: string | undefined;
  let result: SDKResultMessage | undefined;

  try {
    for await (const message of sdkQuery({ prompt, options: sdkOptions })) {
      // Call message callback
      options.onMessage?.(message);

      // Extract text for immediate display
      if (message.type === 'assistant') {
        const assistantMsg = message as SDKAssistantMessage;
        for (const block of assistantMsg.message.content) {
          if ('text' in block && block.text) {
            options.onText?.(block.text);
            responseText += block.text;
          }
        }
      }

      // Capture session ID from init
      if (message.type === 'system' && (message as SDKSystemMessage).subtype === 'init') {
        sessionId = message.session_id;
      }

      // Capture result
      if (message.type === 'result') {
        result = message as SDKResultMessage;
      }
    }
  } catch (error) {
    return {
      response: responseText,
      sessionId,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
      cost: 0,
      durationMs: 0,
      numTurns: 0,
      success: false,
      errorType: 'error_during_execution',
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }

  // Build result from final message
  if (result) {
    const isSuccess = result.subtype === 'success';
    const finalResponse = isSuccess && 'result' in result ? result.result : responseText;
    const errors = !isSuccess && 'errors' in result ? result.errors : undefined;

    return {
      response: finalResponse,
      sessionId,
      tokens: {
        input: result.usage.input_tokens,
        output: result.usage.output_tokens,
        cacheRead: result.usage.cache_read_input_tokens,
        cacheCreation: result.usage.cache_creation_input_tokens,
      },
      cost: result.total_cost_usd,
      durationMs: result.duration_ms,
      numTurns: result.num_turns,
      success: isSuccess,
      errorType: isSuccess ? undefined : result.subtype,
      errors,
    };
  }

  // No result message received
  return {
    response: responseText,
    sessionId,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
    cost: 0,
    durationMs: 0,
    numTurns: 0,
    success: false,
    errorType: 'error_during_execution',
    errors: ['No result message received'],
  };
}

/**
 * Stream query results as an async generator
 */
export async function* streamQuery(
  prompt: string,
  options: QueryOptions = {}
): AsyncGenerator<SDKMessage> {
  const abortController = new AbortController();

  if (options.signal) {
    options.signal.addEventListener('abort', () => abortController.abort());
  }

  const sdkOptions = buildSdkOptions(abortController, {
    ...options,
    includePartialMessages: options.includePartialMessages ?? true,
  });

  yield* sdkQuery({ prompt, options: sdkOptions });
}
