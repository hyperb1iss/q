import { describe, expect, test } from 'bun:test';
import {
  AUTO_APPROVED_TOOLS,
  buildSystemPrompt,
  type EnvironmentContext,
  getEnvironmentContext,
  INTERACTIVE_TOOLS,
  type PromptMode,
} from './prompt.js';

describe('buildSystemPrompt', () => {
  describe('mode selection', () => {
    test('returns query prompt for query mode', () => {
      const result = buildSystemPrompt(undefined, 'query');
      expect(result).toContain('concise terminal assistant');
      expect(result).toContain('do NOT have access to tools');
      expect(result).not.toContain('pipeline filter');
    });

    test('returns pipe prompt for pipe mode', () => {
      const result = buildSystemPrompt(undefined, 'pipe');
      expect(result).toContain('Unix pipeline filter');
      expect(result).toContain('ABSOLUTE RULES');
      expect(result).toContain('NO markdown');
    });

    test('returns agent prompt for agent mode', () => {
      const result = buildSystemPrompt(undefined, 'agent');
      expect(result).toContain("shell's quiet companion");
      expect(result).toContain('Read');
      expect(result).toContain('Glob');
      expect(result).toContain('Grep');
      expect(result).toContain('Bash');
    });

    test('defaults to agent mode when not specified', () => {
      const result = buildSystemPrompt();
      expect(result).toContain("shell's quiet companion");
    });
  });

  describe('environment context', () => {
    test('includes cwd in environment block', () => {
      const ctx: EnvironmentContext = { cwd: '/home/user/project' };
      const result = buildSystemPrompt(ctx, 'query');
      expect(result).toContain('## Environment');
      expect(result).toContain('/home/user/project');
    });

    test('includes shell when provided', () => {
      const ctx: EnvironmentContext = { cwd: '/tmp', shell: '/bin/zsh' };
      const result = buildSystemPrompt(ctx);
      expect(result).toContain('**Shell**: /bin/zsh');
    });

    test('includes terminal program when provided', () => {
      const ctx: EnvironmentContext = { cwd: '/tmp', termProgram: 'iTerm.app' };
      const result = buildSystemPrompt(ctx);
      expect(result).toContain('**Terminal**: iTerm.app');
    });

    test('falls back to term when termProgram not provided', () => {
      const ctx: EnvironmentContext = { cwd: '/tmp', term: 'xterm-256color' };
      const result = buildSystemPrompt(ctx);
      expect(result).toContain('**Terminal**: xterm-256color');
    });

    test('prefers termProgram over term', () => {
      const ctx: EnvironmentContext = {
        cwd: '/tmp',
        term: 'xterm',
        termProgram: 'WezTerm',
      };
      const result = buildSystemPrompt(ctx);
      expect(result).toContain('WezTerm');
      expect(result).not.toContain('xterm');
    });

    test('includes git branch when provided', () => {
      const ctx: EnvironmentContext = {
        cwd: '/tmp',
        gitBranch: 'feature/awesome',
      };
      const result = buildSystemPrompt(ctx);
      expect(result).toContain('**Git Branch**: feature/awesome');
    });

    test('includes git status with branch', () => {
      const ctx: EnvironmentContext = {
        cwd: '/tmp',
        gitBranch: 'main',
        gitStatus: 'dirty',
      };
      const result = buildSystemPrompt(ctx);
      expect(result).toContain('**Git Branch**: main (dirty)');
    });

    test('handles clean git status', () => {
      const ctx: EnvironmentContext = {
        cwd: '/tmp',
        gitBranch: 'main',
        gitStatus: 'clean',
      };
      const result = buildSystemPrompt(ctx);
      expect(result).toContain('**Git Branch**: main (clean)');
    });

    test('omits environment block when no context provided', () => {
      const result = buildSystemPrompt(undefined, 'query');
      expect(result).not.toContain('## Environment');
    });
  });
});

describe('getEnvironmentContext', () => {
  test('returns context with cwd', async () => {
    const ctx = await getEnvironmentContext();
    expect(ctx.cwd).toBe(process.cwd());
  });

  test('includes shell from environment', async () => {
    const ctx = await getEnvironmentContext();
    if (process.env.SHELL) {
      expect(ctx.shell).toBe(process.env.SHELL);
    }
  });

  test('includes term from environment', async () => {
    const ctx = await getEnvironmentContext();
    if (process.env.TERM) {
      expect(ctx.term).toBe(process.env.TERM);
    }
  });

  test('includes git info when in git repo', async () => {
    const ctx = await getEnvironmentContext();
    // This test runs in the q repo, so git should be available
    expect(ctx.gitBranch).toBeDefined();
    expect(['clean', 'dirty']).toContain(ctx.gitStatus);
  });
});

describe('tool constants', () => {
  test('INTERACTIVE_TOOLS contains expected tools', () => {
    expect(INTERACTIVE_TOOLS).toContain('Read');
    expect(INTERACTIVE_TOOLS).toContain('Glob');
    expect(INTERACTIVE_TOOLS).toContain('Grep');
    expect(INTERACTIVE_TOOLS).toContain('Bash');
    expect(INTERACTIVE_TOOLS).toHaveLength(4);
  });

  test('AUTO_APPROVED_TOOLS are read-only tools', () => {
    expect(AUTO_APPROVED_TOOLS).toContain('Read');
    expect(AUTO_APPROVED_TOOLS).toContain('Glob');
    expect(AUTO_APPROVED_TOOLS).toContain('Grep');
    expect(AUTO_APPROVED_TOOLS).not.toContain('Bash');
    expect(AUTO_APPROVED_TOOLS).toHaveLength(3);
  });

  test('AUTO_APPROVED_TOOLS is subset of INTERACTIVE_TOOLS', () => {
    for (const tool of AUTO_APPROVED_TOOLS) {
      expect(INTERACTIVE_TOOLS).toContain(tool);
    }
  });
});

describe('PromptMode type', () => {
  test('accepts valid modes', () => {
    const modes: PromptMode[] = ['query', 'pipe', 'agent'];
    for (const mode of modes) {
      const result = buildSystemPrompt(undefined, mode);
      expect(result.length).toBeGreaterThan(0);
    }
  });
});
