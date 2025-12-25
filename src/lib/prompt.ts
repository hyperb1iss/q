/**
 * System prompt for q - The Shell's Quiet Companion
 */

import { execSync } from 'node:child_process';
import { homedir, hostname, platform, release, userInfo } from 'node:os';

export interface EnvironmentContext {
  cwd: string;
  shell?: string;
  term?: string;
  termProgram?: string;
  gitBranch?: string;
  gitStatus?: 'clean' | 'dirty';
}

/**
 * Build environment context block for the system prompt
 */
function buildEnvironmentBlock(ctx: EnvironmentContext): string {
  const user = userInfo().username;
  const host = hostname();
  const os = `${platform()} ${release()}`;
  const home = homedir();

  let block = `## Environment
- **User**: ${user}@${host}
- **OS**: ${os}
- **Home**: ${home}
- **Working Directory**: ${ctx.cwd}`;

  if (ctx.shell) {
    block += `\n- **Shell**: ${ctx.shell}`;
  }

  if (ctx.termProgram) {
    block += `\n- **Terminal**: ${ctx.termProgram}`;
  } else if (ctx.term) {
    block += `\n- **Terminal**: ${ctx.term}`;
  }

  if (ctx.gitBranch) {
    block += `\n- **Git Branch**: ${ctx.gitBranch}${ctx.gitStatus ? ` (${ctx.gitStatus})` : ''}`;
  }

  return block;
}

const BASE_PROMPT = `You are **q**, the shell's quiet companion - an elegant terminal assistant that helps users work efficiently in their shell environment.

## Your Identity
- You are a focused, efficient assistant embedded in the terminal
- You have direct access to the user's filesystem and can run commands
- You speak concisely - terminal users appreciate brevity
- You're knowledgeable about shell commands, scripting, and development workflows

## Your Capabilities
You have access to these tools:
- **Read** - Read files from the filesystem
- **Glob** - Find files by pattern (e.g., "*.ts", "src/**/*.js")
- **Grep** - Search file contents with regex
- **Bash** - Execute shell commands (with user approval for destructive ops)

## Guidelines
1. **Announce, then act** - Before using tools, write a brief one-liner explaining what you're about to do. Never silently run a bunch of tools.
2. **Be concise** - No fluff. Get to the point.
3. **Show, don't tell** - Use commands and code examples
4. **Use your tools** - Don't ask users to run commands you can run yourself
5. **Explain briefly** - One-line explanations unless more is needed
6. **Format for terminal** - Use markdown that renders well in a terminal

## Examples of Good Responses

User: "what's in this dir"
→ "Let me check the directory structure." [then use Glob/Bash, then summarize results]

User: "find all TODO comments"
→ "Searching for TODOs..." [then use Grep, then show results]

User: "what does this error mean" + error text
→ Explain concisely, suggest a fix (no tools needed)

User: "how do I..."
→ Show the command or code directly (no tools needed)

Remember: You're a power user's companion, not a chatbot. Act accordingly.`;

/**
 * Build a complete system prompt with environment context
 */
export function buildSystemPrompt(ctx?: EnvironmentContext): string {
  const envBlock = ctx ? buildEnvironmentBlock(ctx) : '';
  return envBlock ? `${BASE_PROMPT}\n\n${envBlock}` : BASE_PROMPT;
}

interface GitInfo {
  branch: string;
  status: 'clean' | 'dirty';
}

/**
 * Get git info for the current directory
 */
function getGitContext(): GitInfo | null {
  try {
    // Check if we're in a git repo
    execSync('git rev-parse --is-inside-work-tree', {
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    // Get branch name
    const branch = execSync('git branch --show-current', {
      stdio: 'pipe',
      encoding: 'utf-8',
    }).trim();

    if (!branch) {
      return null;
    }

    // Check if dirty
    let status: 'clean' | 'dirty' = 'clean';
    try {
      execSync('git diff --quiet && git diff --cached --quiet', {
        stdio: 'pipe',
      });
    } catch {
      status = 'dirty';
    }

    return { branch, status };
  } catch {
    return null;
  }
}

/**
 * Get current environment context
 */
export function getEnvironmentContext(): EnvironmentContext {
  const git = getGitContext();

  const ctx: EnvironmentContext = {
    cwd: process.cwd(),
  };

  // Only add optional properties if they have values
  const shell = process.env.SHELL;
  if (shell) ctx.shell = shell;

  const term = process.env.TERM;
  if (term) ctx.term = term;

  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram) ctx.termProgram = termProgram;

  if (git) {
    ctx.gitBranch = git.branch;
    ctx.gitStatus = git.status;
  }

  return ctx;
}

/**
 * Static system prompt (legacy - use buildSystemPrompt for dynamic context)
 */
export const SYSTEM_PROMPT = buildSystemPrompt(getEnvironmentContext());

/**
 * Default tools for interactive mode
 */
export const INTERACTIVE_TOOLS = ['Read', 'Glob', 'Grep', 'Bash'];

/**
 * Tools that are auto-approved (read-only)
 */
export const AUTO_APPROVED_TOOLS = ['Read', 'Glob', 'Grep'];
