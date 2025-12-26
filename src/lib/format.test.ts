import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { setColorMode } from './colors.js';
import {
  formatCost,
  formatError,
  formatRelativeTime,
  formatTokens,
  formatToolCall,
} from './format.js';

// Force colors on for consistent test output
beforeAll(() => {
  setColorMode('always');
});

afterAll(() => {
  setColorMode('auto');
});

describe('formatTokens', () => {
  test('formats small numbers without suffix', () => {
    expect(formatTokens(100, 50)).toBe('150');
    expect(formatTokens(0, 999)).toBe('999');
  });

  test('formats thousands with k suffix and decimal', () => {
    expect(formatTokens(500, 600)).toBe('1.1k');
    expect(formatTokens(2000, 500)).toBe('2.5k');
    expect(formatTokens(5000, 4999)).toBe('10.0k');
  });

  test('formats large numbers with rounded k suffix', () => {
    expect(formatTokens(8000, 4000)).toBe('12k');
    expect(formatTokens(50000, 25000)).toBe('75k');
    expect(formatTokens(100000, 0)).toBe('100k');
  });

  test('handles zero', () => {
    expect(formatTokens(0, 0)).toBe('0');
  });
});

describe('formatCost', () => {
  test('formats tiny costs with 4 decimal places', () => {
    expect(formatCost(0.0001)).toBe('$0.0001');
    expect(formatCost(0.0099)).toBe('$0.0099');
  });

  test('formats small costs with 3 decimal places', () => {
    expect(formatCost(0.01)).toBe('$0.010');
    expect(formatCost(0.025)).toBe('$0.025');
    expect(formatCost(0.099)).toBe('$0.099');
  });

  test('formats normal costs with 2 decimal places', () => {
    expect(formatCost(0.1)).toBe('$0.10');
    expect(formatCost(0.5)).toBe('$0.50');
    expect(formatCost(1.23)).toBe('$1.23');
    expect(formatCost(10.0)).toBe('$10.00');
  });

  test('handles zero', () => {
    expect(formatCost(0)).toBe('$0.0000');
  });
});

describe('formatRelativeTime', () => {
  test('formats very recent times as "just now"', () => {
    const now = Date.now();
    expect(formatRelativeTime(now)).toBe('just now');
    expect(formatRelativeTime(now - 30000)).toBe('just now'); // 30 seconds ago
  });

  test('formats minutes ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 60000)).toBe('1m ago');
    expect(formatRelativeTime(now - 300000)).toBe('5m ago');
    expect(formatRelativeTime(now - 3540000)).toBe('59m ago');
  });

  test('formats hours ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 3600000)).toBe('1h ago');
    expect(formatRelativeTime(now - 7200000)).toBe('2h ago');
    expect(formatRelativeTime(now - 82800000)).toBe('23h ago');
  });

  test('formats days ago', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 86400000)).toBe('1d ago');
    expect(formatRelativeTime(now - 259200000)).toBe('3d ago');
    expect(formatRelativeTime(now - 518400000)).toBe('6d ago');
  });

  test('formats older dates as locale date string', () => {
    const now = Date.now();
    const weekAgo = now - 604800000; // 7 days
    const result = formatRelativeTime(weekAgo);
    // Should be a date string, not "Xd ago"
    expect(result).not.toContain('d ago');
    expect(result).toMatch(/\d/); // Contains numbers (date)
  });
});

describe('formatToolCall', () => {
  test('formats Read tool with file path', () => {
    const result = formatToolCall('Read', { file_path: '/src/index.ts' });
    expect(result).toContain('Read');
    expect(result).toContain('/src/index.ts');
    expect(result).toContain('◈'); // Read icon
  });

  test('formats Glob tool with pattern', () => {
    const result = formatToolCall('Glob', { pattern: '**/*.ts' });
    expect(result).toContain('Glob');
    expect(result).toContain('**/*.ts');
    expect(result).toContain('◇'); // Glob icon
  });

  test('formats Glob tool with pattern and path', () => {
    const result = formatToolCall('Glob', { pattern: '*.ts', path: '/src' });
    expect(result).toContain('*.ts');
    expect(result).toContain('/src');
  });

  test('formats Grep tool with pattern', () => {
    const result = formatToolCall('Grep', { pattern: 'TODO' });
    expect(result).toContain('Grep');
    expect(result).toContain('"TODO"');
    expect(result).toContain('◆'); // Grep icon
  });

  test('formats Bash tool with truncated command', () => {
    const shortCmd = 'ls -la';
    const result = formatToolCall('Bash', { command: shortCmd });
    expect(result).toContain('Bash');
    expect(result).toContain('ls -la');
    expect(result).toContain('▶'); // Bash icon
  });

  test('truncates long Bash commands', () => {
    const longCmd = 'a'.repeat(100);
    const result = formatToolCall('Bash', { command: longCmd });
    expect(result).toContain('...');
    expect(result.length).toBeLessThan(200); // Reasonably truncated
  });

  test('formats Write tool with file path', () => {
    const result = formatToolCall('Write', { file_path: '/output.txt' });
    expect(result).toContain('Write');
    expect(result).toContain('/output.txt');
    expect(result).toContain('◁'); // Write icon
  });

  test('formats Edit tool with file path', () => {
    const result = formatToolCall('Edit', { file_path: '/src/main.ts' });
    expect(result).toContain('Edit');
    expect(result).toContain('/src/main.ts');
    expect(result).toContain('◂'); // Edit icon
  });

  test('formats Task tool with description', () => {
    const result = formatToolCall('Task', { description: 'Run tests' });
    expect(result).toContain('Task');
    expect(result).toContain('Run tests');
    expect(result).toContain('●'); // Task icon
  });

  test('formats unknown tool with JSON preview', () => {
    const result = formatToolCall('CustomTool', { foo: 'bar', count: 42 });
    expect(result).toContain('CustomTool');
    expect(result).toContain('foo');
    expect(result).toContain('▸'); // Default icon
  });
});

describe('formatError', () => {
  test('extracts message from Error instance', () => {
    const error = new Error('Something went wrong');
    expect(formatError(error)).toBe('Something went wrong');
  });

  test('converts string to string', () => {
    expect(formatError('plain string error')).toBe('plain string error');
  });

  test('converts number to string', () => {
    expect(formatError(404)).toBe('404');
  });

  test('handles undefined', () => {
    expect(formatError(undefined)).toBe('undefined');
  });

  test('handles null', () => {
    expect(formatError(null)).toBe('null');
  });

  test('handles objects', () => {
    const result = formatError({ code: 500, msg: 'fail' });
    expect(result).toBe('[object Object]');
  });
});
