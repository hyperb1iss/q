/**
 * System prompt for q - The Shell's Quiet Companion
 */

import { homedir, hostname, platform, release, userInfo } from 'node:os';
import { getGitInfo } from './git.js';

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

/**
 * Query mode prompt - no tools, just answer questions
 */
const QUERY_PROMPT = `You are **q**, a concise terminal assistant.

## Guidelines
- Be concise - terminal users appreciate brevity
- Show, don't tell - use commands and code examples
- Format for terminal - use markdown that renders well in a terminal
- Answer directly - no fluff, get to the point

You do NOT have access to tools. Just answer the question directly.`;

/**
 * Pipe mode prompt - direct output only, no conversation
 */
const PIPE_PROMPT = `You are a Unix pipeline filter. Output goes directly to another program.

ABSOLUTE RULES - VIOLATING THESE BREAKS THE PIPELINE:
1. Output ONLY raw content - NO markdown, NO code blocks, NO backticks
2. NO explanations, NO commentary, NO "Here's...", NO questions
3. If transforming data: output ONLY the transformed data
4. If explaining: output ONLY the explanation text
5. NEVER wrap output in \`\`\` code fences - this corrupts the pipeline

You are cat, sed, jq - a silent transformer. Raw output only.`;

/**
 * Agent mode prompt - has access to tools
 */
const AGENT_PROMPT = `You are **q**, the shell's quiet companion - an elegant terminal assistant that helps users work efficiently in their shell environment.

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

export type PromptMode = 'query' | 'pipe' | 'agent';

/**
 * Build a complete system prompt with environment context
 */
export function buildSystemPrompt(ctx?: EnvironmentContext, mode: PromptMode = 'agent'): string {
  let basePrompt: string;
  switch (mode) {
    case 'query':
      basePrompt = QUERY_PROMPT;
      break;
    case 'pipe':
      basePrompt = PIPE_PROMPT;
      break;
    default:
      basePrompt = AGENT_PROMPT;
      break;
  }

  const envBlock = ctx ? buildEnvironmentBlock(ctx) : '';
  return envBlock ? `${basePrompt}\n\n${envBlock}` : basePrompt;
}

/**
 * Get current environment context (async for non-blocking git)
 */
export async function getEnvironmentContext(): Promise<EnvironmentContext> {
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

  // Fetch git context asynchronously (non-blocking)
  const git = await getGitInfo();
  if (git) {
    ctx.gitBranch = git.branch;
    ctx.gitStatus = git.status;
  }

  return ctx;
}

/**
 * Default tools for interactive mode
 */
export const INTERACTIVE_TOOLS = ['Read', 'Glob', 'Grep', 'Bash'];

/**
 * Tools that are auto-approved (read-only)
 */
export const AUTO_APPROVED_TOOLS = ['Read', 'Glob', 'Grep'];
