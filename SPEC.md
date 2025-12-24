# q — Specification

> The Shell's Quiet Companion

**Version:** 0.1.0-draft **Last Updated:** 2024-12-24 **Status:** Planning

---

## Executive Summary

**q** is a minimal, elegant CLI tool that brings Claude's agent capabilities directly into your
terminal workflow. It's not a replacement for Claude Code—it's a lightning-fast complement for quick
queries, pipe-based context injection, and seamless command execution.

**Philosophy:** Zero friction, maximum power. Think **fzf meets Claude**.

---

## Table of Contents

1. [Goals & Non-Goals](#goals--non-goals)
2. [Invocation Modes](#invocation-modes)
3. [Architecture](#architecture)
4. [UI/UX Design](#uiux-design)
5. [Feature Specifications](#feature-specifications)
6. [Technical Stack](#technical-stack)
7. [Data Flow](#data-flow)
8. [Configuration](#configuration)
9. [Security Model](#security-model)
10. [Distribution](#distribution)
11. [Future Roadmap](#future-roadmap)

---

## Goals & Non-Goals

### Goals

- **Instant invocation** — Sub-100ms startup time
- **Beautiful output** — SilkCircuit design language, syntax highlighting
- **Streaming responses** — First token < 200ms after API response begins
- **Context-aware** — Git state, cwd, stdin, last command
- **Command execution** — Run commands with explicit approval
- **Session continuity** — Resume conversations, searchable history
- **Minimal footprint** — Single binary, no daemon required for basic use

### Non-Goals

- Replace Claude Code for complex tasks
- Full IDE integration
- Multi-model support (Claude-only by design)
- GUI or web interface
- Plugin/extension system (keep it simple)

---

## Invocation Modes

### 1. Quick Query (Default)

```bash
q "what does this error mean"
q "how do I rebase onto main"
q "explain the difference between merge and rebase"
```

**Behavior:**

- Streams response to stdout
- Renders markdown inline
- Displays token count on completion
- Exits with code 0 on success

### 2. Pipe Mode

```bash
cat error.log | q "explain this"
git diff | q "summarize these changes"
pbpaste | q "review this code"
```

**Behavior:**

- Reads stdin until EOF
- Injects content as context with the prompt
- Formats: `<context>\n{stdin}\n</context>\n\n{prompt}`
- Same streaming/exit behavior as quick query

### 3. Interactive Mode

```bash
q              # Opens TUI
q -i           # Explicit flag
q --interactive
```

**Behavior:**

- Full-screen terminal UI
- Multi-turn conversation
- History navigation (up/down arrows)
- Keyboard shortcuts for common actions
- Session persistence

### 4. Execute Mode (Agent)

```bash
q -x "find all TODO comments and list them"
q --execute "run the tests and fix any failures"
```

**Behavior:**

- Enables tool access: Read, Glob, Grep, Bash
- Shows approval UI before each command
- Audit log of all executions
- Safe defaults (no destructive ops without confirm)

### 5. Resume Mode

```bash
q -r              # Resume last session
q --resume abc123 # Resume specific session
```

**Behavior:**

- Loads previous conversation from SQLite
- Continues with full context preserved
- Updates session with new turns

---

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────────┐
│                           CLI Layer                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  Arg Parser │  │   Config    │  │   Context   │             │
│  │   (yargs)   │  │ (cosmiconfig│  │  (git/cwd)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         UI Layer (Ink)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │    Input    │  │  Response   │  │   Approval  │             │
│  │  Component  │  │   Stream    │  │     Card    │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Spinner   │  │  StatusLine │  │   History   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Core Layer                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  useAgent   │  │  Markdown   │  │   Session   │             │
│  │   (SDK)     │  │  Renderer   │  │   Storage   │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Claude API  │  │   SQLite    │  │  File System│             │
│  │  (Agent SDK)│  │  (History)  │  │  (Context)  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
q/
├── src/
│   ├── cli.ts                 # Entry point, arg parsing
│   ├── app.tsx                # Main Ink application
│   ├── components/
│   │   ├── Input.tsx          # Query input with history
│   │   ├── Response.tsx       # Streaming markdown display
│   │   ├── CommandCard.tsx    # Executable command approval
│   │   ├── Spinner.tsx        # Thinking indicator
│   │   ├── StatusLine.tsx     # Token count, model, session
│   │   └── Conversation.tsx   # Multi-turn message list
│   ├── hooks/
│   │   ├── useAgent.ts        # Claude SDK wrapper
│   │   ├── useStream.ts       # Response streaming logic
│   │   ├── useHistory.ts      # Command history navigation
│   │   ├── useConfig.ts       # Configuration loading
│   │   └── useSession.ts      # Session management
│   ├── lib/
│   │   ├── colors.ts          # SilkCircuit ANSI palette
│   │   ├── markdown.ts        # Terminal markdown renderer
│   │   ├── syntax.ts          # Shiki syntax highlighting
│   │   ├── context.ts         # Git/cwd/shell context
│   │   ├── storage.ts         # SQLite session storage
│   │   └── commands.ts        # Command execution helpers
│   └── types.ts               # Shared TypeScript types
├── docs/                      # VitePress documentation
│   ├── .vitepress/
│   │   └── config.ts
│   ├── index.md
│   ├── guide/
│   │   ├── getting-started.md
│   │   ├── modes.md
│   │   ├── configuration.md
│   │   └── shell-integration.md
│   └── reference/
│       ├── cli.md
│       └── config.md
├── test/
│   ├── cli.test.ts
│   ├── markdown.test.ts
│   └── agent.test.ts
├── package.json
├── tsconfig.json
├── biome.json
├── CLAUDE.md
├── SPEC.md                    # This file
└── README.md
```

---

## UI/UX Design

### SilkCircuit Color Palette

All colors use ANSI true color (24-bit) for maximum vibrancy on modern terminals.

```typescript
export const colors = {
  // Primary palette
  purple: '\x1b[38;2;225;53;255m', // #e135ff - Claude thoughts, keywords
  cyan: '\x1b[38;2;128;255;234m', // #80ffea - User input, functions
  coral: '\x1b[38;2;255;106;193m', // #ff6ac1 - Commands, code blocks
  yellow: '\x1b[38;2;241;250;140m', // #f1fa8c - Warnings, highlights
  green: '\x1b[38;2;80;250;123m', // #50fa7b - Success, confirmations
  red: '\x1b[38;2;255;99;99m', // #ff6363 - Errors

  // Neutral palette
  fg: '\x1b[38;2;248;248;242m', // #f8f8f2 - Primary text
  muted: '\x1b[38;2;139;133;160m', // #8b85a0 - Dim text, comments
  bg: '\x1b[48;2;18;16;26m', // #12101a - Background
  bgDark: '\x1b[48;2;10;8;18m', // #0a0812 - Darker background

  // Modifiers
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  reset: '\x1b[0m',
} as const;
```

### Quick Query Layout

```
$ q "what's the difference between rebase and merge"

Rebase rewrites commit history by replaying your commits on top of
another branch, creating a linear history. Merge creates a new commit
that combines two branches, preserving the original history.

┌─────────────────────────────────────────────────┐
│ git rebase main     # Linear, clean history    │
│ git merge main      # Preserves branch context │
└─────────────────────────────────────────────────┘

Use rebase for feature branches before merging. Use merge for
integrating long-lived branches where history matters.

                                            ⚡ 142 tokens │ sonnet
```

### Interactive Mode Layout

```
┌─ q ─────────────────────────────────────────────────── sonnet ─┐
│                                                                │
│  You: How do I rebase my branch onto main?                     │
│                                                                │
│  ──────────────────────────────────────────────────────────── │
│                                                                │
│  To rebase your current branch onto main:                      │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ git fetch origin                                        │   │
│  │ git rebase origin/main                                  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  If you encounter conflicts:                                   │
│  1. Resolve conflicts in each file                            │
│  2. Run `git add <file>` for each resolved file              │
│  3. Run `git rebase --continue`                               │
│                                                                │
│                                              ⚡ 234 tokens     │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│ ▌ Ask a follow-up...                              ⌘↵ run │ ESC │
└────────────────────────────────────────────────────────────────┘
```

### Command Approval Card

```
┌─ Command ──────────────────────────────────────────────────────┐
│                                                                │
│  $ git rebase origin/main                                      │
│                                                                │
│  This will replay your commits on top of origin/main.         │
│  Your current branch has 3 commits ahead of main.             │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  [y] Run    [n] Skip    [e] Edit    [?] Explain               │
└────────────────────────────────────────────────────────────────┘
```

### Spinner States

```
⠋ Thinking...     # Active query
⠙ Reading files...  # Tool execution
⠹ Running command... # Bash execution
✓ Done             # Completion (green)
✗ Error            # Failure (red)
```

---

## Feature Specifications

### F1: Streaming Markdown Renderer

**Requirements:**

- Parse markdown incrementally as tokens stream in
- Render to terminal with ANSI escape codes
- Support: headings, bold, italic, code (inline + blocks), lists, links
- Syntax highlighting for fenced code blocks via shiki
- Handle partial tokens gracefully (e.g., incomplete code blocks)

**Implementation Notes:**

- Use `marked` with custom renderer for ANSI output
- Buffer incomplete tokens (e.g., ``` without closing)
- Shiki initialization is async—cache highlighter instance

### F2: Claude Agent SDK Integration

**Requirements:**

- Wrap `query()` async generator in React hook
- Handle all message types: system, assistant, user, result
- Support streaming with `includePartialMessages: true`
- Manage session IDs for multi-turn conversations
- Configurable permission modes and tool access

**Hook Interface:**

```typescript
interface UseAgentOptions {
  prompt: string;
  model?: 'sonnet' | 'opus' | 'haiku';
  tools?: boolean; // Enable agent tools
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions';
  sessionId?: string; // Resume session
  onToken?: (token: string) => void;
  onToolUse?: (tool: ToolUse) => Promise<ToolApproval>;
}

interface UseAgentResult {
  status: 'idle' | 'streaming' | 'complete' | 'error';
  response: string;
  tokens: { input: number; output: number };
  cost: number;
  sessionId: string;
  error?: Error;
  cancel: () => void;
}
```

### F3: SQLite Session Storage

**Schema:**

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  model TEXT NOT NULL,
  total_tokens INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,  -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  tokens INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);

-- FTS for searching history
CREATE VIRTUAL TABLE messages_fts USING fts5(content, content=messages);
```

**Location:** `~/.local/share/q/history.db`

### F4: Context Injection

**Git Context (when in git repo):**

```typescript
interface GitContext {
  branch: string;
  status: 'clean' | 'dirty';
  ahead: number;
  behind: number;
  recentCommits: Array<{ hash: string; message: string }>;
}
```

**System Prompt Template:**

```
You are q, a concise terminal assistant. You help with shell commands,
git operations, debugging, and quick code questions.

Current context:
- Working directory: {cwd}
- Git branch: {branch} ({status})
- Recent commits: {commits}

Be concise. Use markdown for formatting. When suggesting commands,
use fenced code blocks with the shell language.
```

### F5: Configuration System

**Discovery Order (cosmiconfig):**

1. `q` property in `package.json`
2. `.qrc` (JSON or YAML)
3. `.qrc.json`, `.qrc.yaml`, `.qrc.yml`
4. `q.config.js`, `q.config.mjs`
5. `~/.config/q/config.yaml` (global)

**Schema:**

```yaml
# ~/.config/q/config.yaml
model: sonnet # Default model
maxTokens: 4096 # Response limit
theme: neon # SilkCircuit variant

# Context injection
context:
  git: true # Include git status
  cwd: true # Include working directory
  lastCommand: false # Include previous command output

# Custom system prompts (extend default)
systemPrompt: |
  Additional context about my preferred coding style...

# Prompt aliases
prompts:
  explain: 'Explain this error and suggest a fix:'
  review: 'Review this code for issues and improvements:'
  commit: 'Write a conventional commit message for these changes:'
  test: 'Write tests for this code:'

# Safety settings
safety:
  confirmDestructive: true # Confirm rm, drop, delete, etc.
  maxCostPerQuery: 0.50 # USD limit per query
  blockedCommands: # Never execute these
    - 'rm -rf /'
    - 'sudo rm'
```

---

## Technical Stack

| Component     | Technology                         | Rationale                                             |
| ------------- | ---------------------------------- | ----------------------------------------------------- |
| Runtime       | **Bun**                            | Fast startup, native TypeScript, built-in test runner |
| TUI Framework | **Ink** + **ink-ui**               | React patterns, mature ecosystem, good DX             |
| Agent         | **@anthropic-ai/claude-agent-sdk** | Official SDK with streaming, tools, hooks             |
| Markdown      | **marked**                         | Fast, extensible, streaming-compatible                |
| Syntax        | **shiki**                          | VS Code quality, many themes, WASM-based              |
| Config        | **cosmiconfig**                    | Standard config discovery, multiple formats           |
| SQLite        | **bun:sqlite**                     | Native Bun binding, zero dependencies                 |
| CLI Parser    | **yargs**                          | Feature-rich, TypeScript support                      |
| Linting       | **Biome**                          | Fast, single tool for lint + format                   |
| Testing       | **Vitest**                         | Fast, ESM-native, good Bun compatibility              |
| Docs          | **VitePress**                      | Fast, Vue-based, great DX                             |

### Dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "ink": "^5.0.0",
    "ink-ui": "^0.1.0",
    "react": "^18.3.0",
    "marked": "^14.0.0",
    "shiki": "^1.24.0",
    "cosmiconfig": "^9.0.0",
    "yargs": "^17.7.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@types/bun": "^1.1.0",
    "@types/react": "^18.3.0",
    "@types/yargs": "^17.0.0",
    "typescript": "^5.7.0",
    "vitest": "^2.0.0",
    "vitepress": "^1.5.0"
  }
}
```

---

## Data Flow

### Quick Query Flow

```
┌─────────────────┐
│   User Input    │
│  q "question"   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Parse Args    │────▶│  Load Config    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│ Build Context   │◀────│  Read stdin?    │
│ (git, cwd, etc) │     │  (if piped)     │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Create Agent   │
│    Session      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Stream Query   │──────────────────────┐
│  to Claude API  │                      │
└────────┬────────┘                      │
         │                               │
         ▼                               ▼
┌─────────────────┐     ┌─────────────────┐
│  Render Tokens  │◀────│  Store Session  │
│  to Terminal    │     │   (SQLite)      │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│  Show Status    │
│ (tokens, cost)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Exit (0)     │
└─────────────────┘
```

### Agent Mode Flow (with tools)

```
┌─────────────────┐
│   q -x "task"   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Create Agent   │
│  tools=enabled  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│              Agent Loop                  │
│  ┌─────────────────────────────────┐    │
│  │  Claude decides next action     │    │
│  └──────────────┬──────────────────┘    │
│                 │                        │
│                 ▼                        │
│  ┌─────────────────────────────────┐    │
│  │  Tool requested?                 │    │
│  └──────────────┬──────────────────┘    │
│          yes    │    no                  │
│    ┌────────────┴────────────┐          │
│    ▼                         ▼          │
│  ┌──────────────┐  ┌──────────────┐     │
│  │ Show Approval│  │ Stream Text  │     │
│  │     Card     │  │   Response   │     │
│  └──────┬───────┘  └──────────────┘     │
│         │                               │
│         ▼                               │
│  ┌──────────────┐                       │
│  │ User: y/n/e  │                       │
│  └──────┬───────┘                       │
│    y    │    n                          │
│  ┌──────┴──────┐                        │
│  ▼             ▼                        │
│  Execute     Skip                       │
│  Tool        Tool                       │
│  │             │                        │
│  └─────┬───────┘                        │
│        │                                │
│        ▼                                │
│  ┌─────────────────────────────────┐    │
│  │  Continue loop until complete   │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

---

## Security Model

### Principle of Least Privilege

1. **Default mode**: Read-only. No tools enabled.
2. **Execute mode (-x)**: Explicit opt-in for tool access.
3. **Destructive commands**: Always require confirmation.
4. **No implicit execution**: Commands shown, never auto-run.

### Blocked Patterns

The following patterns are blocked by default:

```typescript
const BLOCKED_COMMANDS = [
  /rm\s+-rf\s+[\/~]/, // rm -rf / or ~
  /sudo\s+rm/, // sudo rm anything
  />\s*\/dev\/sd[a-z]/, // write to block devices
  /mkfs\./, // format filesystems
  /dd\s+.*of=\/dev/, // dd to devices
  /:(){.*};:/, // fork bombs
  /chmod\s+-R\s+777\s+\//, // chmod 777 on root
];
```

### Cost Controls

- Default per-query limit: $0.50 USD
- Configurable in `.qrc`
- Warning at 80% of limit
- Hard stop at 100%

### Audit Trail

When tools are used, all executions are logged:

```typescript
interface AuditEntry {
  timestamp: number;
  sessionId: string;
  tool: string;
  input: Record<string, unknown>;
  approved: boolean;
  output?: string;
  error?: string;
}
```

Location: `~/.local/share/q/audit.jsonl`

---

## Distribution

### npm (Primary)

```bash
npm install -g @hyperb1iss/q
# or
bun add -g @hyperb1iss/q
```

### Compiled Binary

Using `bun build --compile`:

```bash
# macOS (Apple Silicon)
curl -fsSL https://github.com/hyperb1iss/q/releases/latest/download/q-darwin-arm64 -o q
chmod +x q
sudo mv q /usr/local/bin/

# macOS (Intel)
curl -fsSL https://github.com/hyperb1iss/q/releases/latest/download/q-darwin-x64 -o q

# Linux (x64)
curl -fsSL https://github.com/hyperb1iss/q/releases/latest/download/q-linux-x64 -o q
```

### Homebrew (Future)

```bash
brew tap hyperb1iss/tap
brew install q
```

### Size Targets

| Distribution    | Target Size |
| --------------- | ----------- |
| npm package     | < 2 MB      |
| Compiled binary | < 50 MB     |

---

## Future Roadmap

### Phase 1: MVP (v0.1)

- [ ] Project scaffolding
- [ ] Single-shot query mode
- [ ] Pipe mode
- [ ] Basic markdown rendering
- [ ] Token/cost display

### Phase 2: Polish (v0.2)

- [ ] Syntax highlighting
- [ ] Interactive TUI mode
- [ ] Session storage
- [ ] Configuration system

### Phase 3: Agent (v0.3)

- [ ] Execute mode with tools
- [ ] Command approval UI
- [ ] Audit logging
- [ ] Safety controls

### Phase 4: Integration (v0.4)

- [ ] Shell plugin (zsh/bash)
- [ ] Git context awareness
- [ ] Last command context
- [ ] Hotkey support

### Phase 5: Distribution (v1.0)

- [ ] Compiled binaries
- [ ] Homebrew formula
- [ ] Full documentation
- [ ] GitHub Actions CI/CD

---

## References

- [Claude Agent SDK Documentation](https://docs.anthropic.com/en/docs/agents-and-tools)
- [Ink - React for CLIs](https://github.com/vadimdemedes/ink)
- [SilkCircuit Design Language](~/dev/conventions/shared/STYLE_GUIDE.md)
- [hyperb1iss Conventions](~/dev/conventions)

---

_This specification is a living document. Updates will be tracked in git._
