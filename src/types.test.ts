import { describe, expect, test } from 'bun:test';
import type { Result } from './types.js';
import { defaultConfig, err, ok } from './types.js';

describe('Result type helpers', () => {
  describe('ok()', () => {
    test('creates success result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    test('works with objects', () => {
      const result = ok({ name: 'test', count: 5 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.name).toBe('test');
        expect(result.value.count).toBe(5);
      }
    });

    test('works with null/undefined', () => {
      const nullResult = ok(null);
      const undefinedResult = ok(undefined);
      expect(nullResult.ok).toBe(true);
      expect(undefinedResult.ok).toBe(true);
    });
  });

  describe('err()', () => {
    test('creates failure result', () => {
      const result = err(new Error('failed'));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('failed');
      }
    });

    test('works with string errors', () => {
      const result = err('something went wrong');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe('something went wrong');
      }
    });

    test('works with custom error types', () => {
      type ApiError = { code: number; message: string };
      const result: Result<never, ApiError> = err({ code: 404, message: 'Not found' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(404);
        expect(result.error.message).toBe('Not found');
      }
    });
  });

  describe('Result type guards', () => {
    test('type narrowing works in if blocks', () => {
      const successResult: Result<number> = ok(42);
      const failResult: Result<number> = err(new Error('fail'));

      if (successResult.ok) {
        // TypeScript should know this is the success case
        const val: number = successResult.value;
        expect(val).toBe(42);
      }

      if (!failResult.ok) {
        // TypeScript should know this is the error case
        const error: Error = failResult.error;
        expect(error.message).toBe('fail');
      }
    });
  });
});

describe('defaultConfig', () => {
  test('has correct model default', () => {
    expect(defaultConfig.model).toBe('sonnet');
  });

  test('has correct maxTokens default', () => {
    expect(defaultConfig.maxTokens).toBe(4096);
  });

  test('has correct theme default', () => {
    expect(defaultConfig.theme).toBe('neon');
  });

  test('has context settings', () => {
    expect(defaultConfig.context.git).toBe(true);
    expect(defaultConfig.context.cwd).toBe(true);
    expect(defaultConfig.context.lastCommand).toBe(false);
  });

  test('has safety settings', () => {
    expect(defaultConfig.safety.confirmDestructive).toBe(true);
    expect(defaultConfig.safety.maxCostPerQuery).toBe(0.5);
    expect(Array.isArray(defaultConfig.safety.blockedCommands)).toBe(true);
  });

  test('has empty prompts by default', () => {
    expect(Object.keys(defaultConfig.prompts)).toHaveLength(0);
  });
});
