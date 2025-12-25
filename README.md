# q

[![CI](https://github.com/hyperb1iss/q/actions/workflows/ci.yml/badge.svg)](https://github.com/hyperb1iss/q/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@hyperb1iss/q.svg)](https://www.npmjs.com/package/@hyperb1iss/q)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> The Shell's Quiet Companion

**q** is an elegant CLI tool that brings Claude's agent capabilities directly into your terminal
workflow. Quick queries, pipe-based context, and seamless command execution—all with a gorgeous TUI.

## Installation

```bash
# Using bun (recommended)
bun add -g @hyperb1iss/q

# Using npm
npm install -g @hyperb1iss/q
```

## Quick Start

```bash
# Quick question
q "what does this error mean"

# Pipe context
cat error.log | q "explain this"

# Interactive mode
q

# Agent mode (with tool access)
q -x "find all TODO comments"
```

## Modes

| Mode            | Invocation            | Description                           |
| --------------- | --------------------- | ------------------------------------- |
| **Query**       | `q "question"`        | Single question, streaming response   |
| **Pipe**        | `stdin \| q "prompt"` | Inject stdin as context               |
| **Interactive** | `q` or `q -i`         | Full TUI with multi-turn conversation |
| **Execute**     | `q -x "task"`         | Agent mode with tool access           |

## Configuration

Create `~/.config/q/config.yaml`:

```yaml
model: sonnet
maxTokens: 4096

context:
  git: true
  cwd: true

prompts:
  explain: 'Explain this error and suggest a fix:'
  review: 'Review this code for issues:'
```

## Requirements

- [Bun](https://bun.sh) 1.1+ or Node.js 20+
- Anthropic API key (`ANTHROPIC_API_KEY`)

## Development

```bash
# Install dependencies
bun install

# Run in development
bun run dev

# Build
bun run build

# Compile to standalone binary
bun run build:compile
```

## License

Apache-2.0

---

Built with 💜 by [hyperb1iss](https://github.com/hyperb1iss)
