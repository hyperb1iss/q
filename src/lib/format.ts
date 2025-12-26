/**
 * Formatting utilities for CLI output
 */

import { color, semantic } from './colors.js';

/** Time constants in milliseconds */
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/** Time unit boundaries */
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;

/** Token formatting thresholds */
const TOKENS_USE_RAW = 1_000;
const TOKENS_USE_DECIMAL = 10_000;

/** Display width for separators and truncation */
export const SEPARATOR_WIDTH = 60;
const TRUNCATE_LENGTH = 60;

/**
 * Format token count nicely
 */
export function formatTokens(input: number, output: number): string {
  const total = input + output;
  if (total < TOKENS_USE_RAW) return `${total}`;
  if (total < TOKENS_USE_DECIMAL) return `${(total / 1000).toFixed(1)}k`;
  return `${Math.round(total / 1000)}k`;
}

/**
 * Format cost nicely
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 0.1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

/**
 * Extract error message from unknown error value
 */
export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Format relative time
 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / MS_PER_MINUTE);
  const hours = Math.floor(diff / MS_PER_HOUR);
  const days = Math.floor(diff / MS_PER_DAY);

  if (mins < 1) return 'just now';
  if (mins < MINUTES_PER_HOUR) return `${mins}m ago`;
  if (hours < HOURS_PER_DAY) return `${hours}h ago`;
  if (days < DAYS_PER_WEEK) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Tool icons for pretty output - stylish unicode symbols */
const TOOL_ICONS: Record<string, string> = {
  Read: '◈',
  Glob: '◇',
  Grep: '◆',
  Bash: '▶',
  Write: '◁',
  Edit: '◂',
  MultiEdit: '◂',
  Task: '●',
  WebFetch: '◎',
  WebSearch: '◎',
};

/**
 * Format a tool call for display
 */
export function formatToolCall(toolName: string, input: Record<string, unknown>): string {
  const icon = TOOL_ICONS[toolName] ?? '▸';
  const toolColor = color(toolName, 'coral', 'bold');

  let inputSummary = '';
  switch (toolName) {
    case 'Read':
      inputSummary = color(input.file_path as string, 'cyan');
      break;
    case 'Glob':
      inputSummary = `${color(String(input.pattern), 'yellow')}${input.path ? ` in ${color(String(input.path), 'cyan')}` : ''}`;
      break;
    case 'Grep':
      inputSummary = `${color(`"${input.pattern}"`, 'yellow')}${input.path ? ` in ${color(String(input.path), 'cyan')}` : ''}`;
      break;
    case 'Bash':
      inputSummary = color(
        (input.command as string).slice(0, TRUNCATE_LENGTH) +
          ((input.command as string).length > TRUNCATE_LENGTH ? '...' : ''),
        'cyan'
      );
      break;
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      inputSummary = color(input.file_path as string, 'cyan');
      break;
    case 'Task':
      inputSummary = color(
        String(input.description ?? input.prompt ?? '').slice(0, TRUNCATE_LENGTH),
        'purple'
      );
      break;
    default:
      inputSummary = semantic.muted(JSON.stringify(input).slice(0, TRUNCATE_LENGTH));
  }

  return `  ${icon} ${toolColor} ${inputSummary}`;
}

/**
 * Format elapsed time in seconds
 */
export function formatElapsed(startTime: number): string {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  return `${elapsed}s`;
}

/** Thinking indicator state */
export interface ThinkingIndicator {
  stop: () => void;
}

/**
 * Create a thinking indicator with elapsed time
 * Updates every second to show elapsed time
 */
export function createThinkingIndicator(
  label: string,
  formatter: (text: string) => string
): ThinkingIndicator {
  const startTime = Date.now();

  // Write initial indicator
  process.stdout.write(formatter(`${label}...`));

  // Update every second with elapsed time
  const interval = setInterval(() => {
    const elapsed = formatElapsed(startTime);
    process.stdout.write(`\r\x1b[K${formatter(`${label}... ${elapsed}`)}`);
  }, 1000);

  return {
    stop: () => {
      clearInterval(interval);
      process.stdout.write('\r\x1b[K');
    },
  };
}
