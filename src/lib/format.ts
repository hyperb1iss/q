/**
 * Formatting utilities for CLI output
 */

import { color, semantic, status } from './colors.js';

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

/**
 * Format a tool call for display
 */
export function formatToolCall(toolName: string, input: Record<string, unknown>): string {
  const toolColor = color(toolName, 'coral', 'bold');

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

  return `  ${status.tool} ${toolColor} ${semantic.muted(inputSummary)}`;
}
