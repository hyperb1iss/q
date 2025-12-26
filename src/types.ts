/**
 * Shared TypeScript types for q
 */

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a success result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create a failure result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Invocation mode for q
 */
export type Mode = 'query' | 'pipe' | 'interactive' | 'execute';

/**
 * CLI arguments parsed by yargs
 */
export interface CliArgs {
  /** The query/prompt text */
  query?: string;

  /** Interactive mode */
  interactive?: boolean;

  /** Execute mode (enable tools) */
  execute?: boolean;

  /** Resume a previous session */
  resume?: string | boolean;

  /** List recent sessions */
  sessions?: boolean;

  /** Model to use */
  model?: 'sonnet' | 'opus' | 'haiku';

  /** Stream response (default: true) */
  stream?: boolean;

  /** Quiet mode - minimal output */
  quiet?: boolean;

  /** Verbose mode - show tokens/cost stats */
  verbose?: boolean;

  /** Raw output without markdown formatting */
  raw?: boolean;

  /** JSON output mode */
  json?: boolean;

  /** Files to include as context */
  file?: string[];

  /** Output shell integration script */
  shellInit?: 'bash' | 'zsh' | 'fish';

  /** Color mode: auto, always, never */
  color?: 'auto' | 'always' | 'never';

  /** Show version */
  version?: boolean;

  /** Show help */
  help?: boolean;
}

/**
 * Configuration from .qrc or config file
 */
export interface Config {
  /** Default model */
  model: 'sonnet' | 'opus' | 'haiku';

  /** Max tokens for response */
  maxTokens: number;

  /** Theme variant */
  theme: 'neon' | 'vibrant' | 'soft' | 'glow';

  /** Context injection settings */
  context: {
    git: boolean;
    cwd: boolean;
    lastCommand: boolean;
  };

  /** Additional system prompt */
  systemPrompt?: string;

  /** Prompt aliases */
  prompts: Record<string, string>;

  /** Safety settings */
  safety: {
    confirmDestructive: boolean;
    maxCostPerQuery: number;
    blockedCommands: string[];
    /** Max input size in characters (default: 100000) */
    maxInputSize: number;
  };
}

/**
 * Default configuration
 */
export const defaultConfig: Config = {
  model: 'sonnet',
  maxTokens: 4096,
  theme: 'neon',
  context: {
    git: true,
    cwd: true,
    lastCommand: false,
  },
  prompts: {},
  safety: {
    confirmDestructive: true,
    maxCostPerQuery: 0.5,
    blockedCommands: [],
    maxInputSize: 100000, // ~100KB, about 25k tokens
  },
};

/**
 * Git context information
 */
export interface GitContext {
  branch: string;
  status: 'clean' | 'dirty';
  ahead: number;
  behind: number;
  recentCommits: Array<{
    hash: string;
    message: string;
  }>;
}

/**
 * Message in a conversation
 */
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens?: number;
  timestamp: number;
}

/**
 * A conversation session
 */
export interface Session {
  id: string;
  /** SDK session ID for resume functionality */
  sdkSessionId?: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  messages: Message[];
  totalTokens: number;
  totalCost: number;
}

/**
 * Agent tool use request
 */
export interface ToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * User's decision on tool approval
 */
export type ToolApproval =
  | { decision: 'allow' }
  | { decision: 'deny'; reason?: string }
  | { decision: 'edit'; input: Record<string, unknown> };
