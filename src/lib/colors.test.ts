import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { color, colors, semantic, setColorMode, status } from './colors.js';

// Force colors on for tests (no TTY in test environment)
beforeAll(() => {
  setColorMode('always');
});

afterAll(() => {
  setColorMode('auto');
});

describe('colors', () => {
  test('exports ANSI true color codes', () => {
    expect(colors.purple).toContain('\x1b[38;2;');
    expect(colors.cyan).toContain('\x1b[38;2;');
    expect(colors.coral).toContain('\x1b[38;2;');
    expect(colors.reset).toBe('\x1b[0m');
  });

  test('exports modifier codes', () => {
    expect(colors.bold).toBe('\x1b[1m');
    expect(colors.dim).toBe('\x1b[2m');
    expect(colors.italic).toBe('\x1b[3m');
    expect(colors.underline).toBe('\x1b[4m');
  });
});

describe('color()', () => {
  test('applies single color', () => {
    const result = color('hello', 'purple');
    expect(result).toContain(colors.purple);
    expect(result).toContain('hello');
    expect(result).toContain(colors.reset);
  });

  test('applies multiple styles', () => {
    const result = color('hello', 'cyan', 'bold');
    expect(result).toContain(colors.cyan);
    expect(result).toContain(colors.bold);
    expect(result).toContain('hello');
    expect(result).toContain(colors.reset);
  });

  test('resets at end of string', () => {
    const result = color('text', 'green');
    expect(result.endsWith(colors.reset)).toBe(true);
  });
});

describe('semantic helpers', () => {
  test('success applies green', () => {
    const result = semantic.success('ok');
    expect(result).toContain(colors.green);
    expect(result).toContain('ok');
  });

  test('error applies red', () => {
    const result = semantic.error('failed');
    expect(result).toContain(colors.red);
    expect(result).toContain('failed');
  });

  test('warning applies yellow', () => {
    const result = semantic.warning('caution');
    expect(result).toContain(colors.yellow);
  });

  test('info applies cyan', () => {
    const result = semantic.info('notice');
    expect(result).toContain(colors.cyan);
  });

  test('muted applies muted color', () => {
    const result = semantic.muted('dim');
    expect(result).toContain(colors.muted);
  });

  test('highlight applies purple and bold', () => {
    const result = semantic.highlight('important');
    expect(result).toContain(colors.purple);
    expect(result).toContain(colors.bold);
  });

  test('code applies coral', () => {
    const result = semantic.code('function()');
    expect(result).toContain(colors.coral);
  });
});

describe('status indicators', () => {
  test('success is green checkmark', () => {
    expect(status.success).toContain('✓');
    expect(status.success).toContain(colors.green);
  });

  test('error is red x', () => {
    expect(status.error).toContain('✗');
    expect(status.error).toContain(colors.red);
  });

  test('warning is yellow warning sign', () => {
    expect(status.warning).toContain('⚠');
    expect(status.warning).toContain(colors.yellow);
  });

  test('pending is muted circle', () => {
    expect(status.pending).toContain('○');
    expect(status.pending).toContain(colors.muted);
  });

  test('active is purple filled circle', () => {
    expect(status.active).toContain('●');
    expect(status.active).toContain(colors.purple);
  });

  test('info is cyan info symbol', () => {
    expect(status.info).toContain('ℹ');
    expect(status.info).toContain(colors.cyan);
  });

  test('tool is coral arrow', () => {
    expect(status.tool).toContain('▸');
    expect(status.tool).toContain(colors.coral);
  });

  test('thinking is purple diamond', () => {
    expect(status.thinking).toContain('◆');
    expect(status.thinking).toContain(colors.purple);
  });
});
