# q - Claude Instructions

Project-specific context for AI assistants working in this codebase.

## Overview

**q** is the shell's quiet companion—an elegant CLI tool that brings Claude's agent capabilities
directly into your terminal workflow. Built with Bun, Ink (React for terminals), and the Claude
Agent SDK.

- **Language**: TypeScript
- **Runtime**: Bun
- **Package Manager**: bun (npm-compatible)
- **Test Framework**: Bun's built-in test runner
- **Linting**: Biome

## Architecture

```
src/
├── cli.ts              # Entry point, arg parsing with yargs
├── app.tsx             # Main Ink application
├── components/         # React components for TUI
├── hooks/              # React hooks (useAgent, useStream, etc.)
├── lib/                # Core utilities (colors, markdown, storage)
└── types.ts            # Shared TypeScript types
```

### Key Patterns

- **SilkCircuit Design**: All colors use the SilkCircuit ANSI palette (see `lib/colors.ts`)
- **Streaming-first**: Responses stream token-by-token with incremental rendering
- **Discriminated Unions**: Use `{ ok: true; value: T } | { ok: false; error: E }` for results
- **Hooks over Classes**: React patterns throughout, even in non-UI code

## Development Commands

```bash
# Run in development (with watch)
bun run dev

# Build for distribution
bun run build

# Compile to standalone binary
bun run build:compile

# Type check
bun run typecheck

# Lint and format
bun run check

# Run tests
bun test

# Documentation
bun run docs:dev
```

## Code Style

- Follow existing patterns in the codebase
- Use Biome for all JS/TS formatting (never ESLint)
- Prefer explicit over implicit
- Keep functions focused and testable
- Use meaningful names over comments
- SilkCircuit colors only—no arbitrary ANSI codes

## Important Files

- `package.json` - Project configuration
- `src/cli.ts` - Application entry point
- `src/lib/colors.ts` - SilkCircuit color palette
- `SPEC.md` - Full specification document
- `docs/` - VitePress documentation

## Boundaries

- Never auto-commit, push, or tag without explicit approval
- Never start/restart long-running services without asking
- Propose major refactors before implementing
- All command execution requires user approval (in agent mode)

## Common Tasks

### Adding a new component

1. Create component in `src/components/`
2. Export from component index if public
3. Use SilkCircuit colors from `lib/colors.ts`
4. Add tests in `src/components/__tests__/`

### Working with the Claude SDK

The agent integration lives in `src/hooks/useAgent.ts`. Key patterns:

- Use async generators for streaming
- Handle all message types (system, assistant, user, result)
- Session IDs enable multi-turn conversations

### Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test src/lib/markdown.test.ts

# Watch mode
bun test --watch
```
