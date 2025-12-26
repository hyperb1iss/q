/**
 * Formatting utilities for CLI output
 */

import { color, semantic } from './colors.js';

/**
 * Format token count nicely
 */
export function formatTokens(input: number, output: number): string {
  const total = input + output;
  if (total < 1000) return `${total}`;
  if (total < 10000) return `${(total / 1000).toFixed(1)}k`;
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
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
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
        (input.command as string).slice(0, 60) +
          ((input.command as string).length > 60 ? '...' : ''),
        'cyan'
      );
      break;
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
      inputSummary = color(input.file_path as string, 'cyan');
      break;
    case 'Task':
      inputSummary = color(String(input.description ?? input.prompt ?? '').slice(0, 50), 'purple');
      break;
    default:
      inputSummary = semantic.muted(JSON.stringify(input).slice(0, 60));
  }

  return `  ${icon} ${toolColor} ${inputSummary}`;
}
