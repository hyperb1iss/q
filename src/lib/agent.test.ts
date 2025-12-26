/**
 * Tests for Claude Agent SDK integration
 *
 * Note: These tests focus on the module structure and types.
 * Full integration tests would require mocking the SDK or running against a real API.
 */

import { describe, expect, test } from 'bun:test';
import type { QueryOptions, QueryResult } from './agent.js';
import { query, streamQuery } from './agent.js';

describe('agent module exports', () => {
  test('exports query function', () => {
    expect(typeof query).toBe('function');
  });

  test('exports streamQuery function', () => {
    expect(typeof streamQuery).toBe('function');
  });
});

describe('QueryOptions type', () => {
  test('accepts empty options', () => {
    const options: QueryOptions = {};
    expect(options).toBeDefined();
  });

  test('accepts all option fields', () => {
    const options: QueryOptions = {
      cwd: '/tmp',
      model: 'claude-sonnet-4',
      systemPrompt: 'You are a helpful assistant',
      appendSystemPrompt: 'Extra instructions',
      permissionMode: 'default',
      allowedTools: ['Read', 'Glob'],
      disallowedTools: ['Bash'],
      tools: ['Read', 'Write'],
      maxBudgetUsd: 1.0,
      maxTurns: 5,
      includePartialMessages: true,
      canUseTool: async () => ({ behavior: 'allow', updatedInput: {} }),
      onMessage: () => {
        /* callback placeholder */
      },
      onText: () => {
        /* callback placeholder */
      },
      signal: new AbortController().signal,
      resume: 'session_abc123',
    };
    expect(options.cwd).toBe('/tmp');
    expect(options.model).toBe('claude-sonnet-4');
    expect(options.resume).toBe('session_abc123');
  });

  test('canUseTool callback receives correct signature', async () => {
    let receivedToolName: string | undefined;
    let receivedInput: Record<string, unknown> | undefined;

    const options: QueryOptions = {
      canUseTool: async (toolName, input) => {
        receivedToolName = toolName;
        receivedInput = input;
        return { behavior: 'allow', updatedInput: input };
      },
    };

    await options.canUseTool?.('Bash', { command: 'ls' });

    expect(receivedToolName).toBe('Bash');
    expect(receivedInput).toEqual({ command: 'ls' });
  });

  test('canUseTool can return deny', async () => {
    const options: QueryOptions = {
      canUseTool: async () => ({ behavior: 'deny', message: 'Not allowed' }),
    };

    const result = await options.canUseTool?.('Bash', {});
    expect(result?.behavior).toBe('deny');
    expect(result && 'message' in result && result.message).toBe('Not allowed');
  });
});

describe('QueryResult type', () => {
  test('success result structure', () => {
    const result: QueryResult = {
      response: 'Hello!',
      sessionId: 'session_123',
      tokens: {
        input: 100,
        output: 50,
        cacheRead: 20,
        cacheCreation: 10,
      },
      cost: 0.05,
      durationMs: 1500,
      numTurns: 1,
      success: true,
      errorType: undefined,
      errors: undefined,
    };

    expect(result.success).toBe(true);
    expect(result.response).toBe('Hello!');
    expect(result.tokens.input).toBe(100);
    expect(result.cost).toBe(0.05);
    expect(result.errorType).toBeUndefined();
  });

  test('error result structure', () => {
    const result: QueryResult = {
      response: '',
      sessionId: undefined,
      tokens: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheCreation: 0,
      },
      cost: 0,
      durationMs: 0,
      numTurns: 0,
      success: false,
      errorType: 'error_during_execution',
      errors: ['Connection failed'],
    };

    expect(result.success).toBe(false);
    expect(result.errorType).toBe('error_during_execution');
    expect(result.errors).toEqual(['Connection failed']);
  });
});

describe('AbortSignal handling', () => {
  test('options accept AbortSignal', () => {
    const controller = new AbortController();
    const options: QueryOptions = {
      signal: controller.signal,
    };

    expect(options.signal).toBeDefined();
    expect(options.signal?.aborted).toBe(false);

    controller.abort();
    expect(options.signal?.aborted).toBe(true);
  });
});

describe('callback options', () => {
  test('onMessage callback receives messages', () => {
    const messages: unknown[] = [];
    const options: QueryOptions = {
      onMessage: msg => messages.push(msg),
    };

    // Simulate calling the callback
    options.onMessage?.({ type: 'system', subtype: 'init' });
    options.onMessage?.({ type: 'assistant', message: { content: [] } });

    expect(messages.length).toBe(2);
    expect(messages[0]).toEqual({ type: 'system', subtype: 'init' });
  });

  test('onText callback receives text chunks', () => {
    const chunks: string[] = [];
    const options: QueryOptions = {
      onText: text => chunks.push(text),
    };

    options.onText?.('Hello');
    options.onText?.(' ');
    options.onText?.('world');

    expect(chunks.join('')).toBe('Hello world');
  });
});

describe('permission modes', () => {
  test('accepts all permission modes', () => {
    const modes: QueryOptions['permissionMode'][] = [
      'default',
      'acceptEdits',
      'bypassPermissions',
      'plan',
    ];

    for (const mode of modes) {
      const options: QueryOptions = { permissionMode: mode };
      expect(options.permissionMode).toBe(mode);
    }
  });
});

describe('system prompt options', () => {
  test('accepts string systemPrompt', () => {
    const options: QueryOptions = {
      systemPrompt: 'You are a code reviewer',
    };
    expect(options.systemPrompt).toBe('You are a code reviewer');
  });

  test('accepts appendSystemPrompt', () => {
    const options: QueryOptions = {
      appendSystemPrompt: 'Additional guidelines...',
    };
    expect(options.appendSystemPrompt).toBe('Additional guidelines...');
  });

  test('both prompts can coexist in options', () => {
    // Note: In practice, systemPrompt takes precedence
    const options: QueryOptions = {
      systemPrompt: 'Override',
      appendSystemPrompt: 'Extra',
    };
    expect(options.systemPrompt).toBe('Override');
    expect(options.appendSystemPrompt).toBe('Extra');
  });
});

describe('resume functionality', () => {
  test('accepts resume session ID', () => {
    const options: QueryOptions = {
      resume: 'sdk_session_abc123xyz',
    };
    expect(options.resume).toBe('sdk_session_abc123xyz');
  });

  test('resume is optional', () => {
    const options: QueryOptions = {};
    expect(options.resume).toBeUndefined();
  });
});

describe('tool restrictions', () => {
  test('can specify allowed tools', () => {
    const options: QueryOptions = {
      allowedTools: ['Read', 'Glob', 'Grep'],
    };
    expect(options.allowedTools).toHaveLength(3);
  });

  test('can specify disallowed tools', () => {
    const options: QueryOptions = {
      disallowedTools: ['Bash', 'Write'],
    };
    expect(options.disallowedTools).toHaveLength(2);
  });

  test('can restrict to specific tools', () => {
    const options: QueryOptions = {
      tools: ['Read'],
    };
    expect(options.tools).toEqual(['Read']);
  });
});

describe('budget and limits', () => {
  test('can set max budget', () => {
    const options: QueryOptions = {
      maxBudgetUsd: 0.5,
    };
    expect(options.maxBudgetUsd).toBe(0.5);
  });

  test('can set max turns', () => {
    const options: QueryOptions = {
      maxTurns: 10,
    };
    expect(options.maxTurns).toBe(10);
  });

  test('can set working directory', () => {
    const options: QueryOptions = {
      cwd: '/home/user/project',
    };
    expect(options.cwd).toBe('/home/user/project');
  });
});
