# Configuration Reference

## Schema

```typescript
interface Config {
  // Default model for queries
  model: 'sonnet' | 'opus' | 'haiku';

  // Maximum tokens for response
  maxTokens: number;

  // Theme variant
  theme: 'neon' | 'vibrant' | 'soft' | 'glow';

  // Context injection settings
  context: {
    git: boolean; // Include git branch, status, commits
    cwd: boolean; // Include current working directory
    lastCommand: boolean; // Include previous command output
  };

  // Additional system prompt
  systemPrompt?: string;

  // Prompt aliases
  prompts: Record<string, string>;

  // Safety settings
  safety: {
    confirmDestructive: boolean; // Confirm dangerous commands
    maxCostPerQuery: number; // USD limit per query
    blockedCommands: string[]; // Patterns to never execute
  };
}
```

## Default Values

```yaml
model: sonnet
maxTokens: 4096
theme: neon

context:
  git: true
  cwd: true
  lastCommand: false

prompts: {}

safety:
  confirmDestructive: true
  maxCostPerQuery: 0.50
  blockedCommands: []
```

## Options

### model

The Claude model to use for queries.

| Value    | Description                          |
| -------- | ------------------------------------ |
| `sonnet` | Balanced speed and quality (default) |
| `opus`   | Maximum capability, slower           |
| `haiku`  | Fastest, best for simple queries     |

### maxTokens

Maximum tokens in the response. Range: 1-4096.

### theme

SilkCircuit color theme variant.

| Value     | Description                                |
| --------- | ------------------------------------------ |
| `neon`    | Full intensity, maximum vibrancy (default) |
| `vibrant` | 85% intensity                              |
| `soft`    | 70% intensity, easier on eyes              |
| `glow`    | Maximum contrast                           |

### context.git

When `true`, includes:

- Current branch name
- Clean/dirty status
- Commits ahead/behind
- Recent commit messages

### context.cwd

When `true`, includes the current working directory path.

### context.lastCommand

When `true`, includes the output of the previous shell command.

### systemPrompt

Additional instructions appended to the default system prompt.

### prompts

Aliases for common prompts. Use with `@alias` syntax:

```bash
q @explain "$(cat error.log)"
```

### safety.confirmDestructive

When `true`, always prompts for confirmation before executing commands that match destructive
patterns (rm, drop, delete, etc.).

### safety.maxCostPerQuery

Maximum cost in USD allowed per query. Queries exceeding this will be stopped.

### safety.blockedCommands

Array of regex patterns for commands that should never be executed.
