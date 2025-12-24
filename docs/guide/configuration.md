# Configuration

**q** uses [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) for configuration discovery.

## Config File Locations

Configuration is searched in the following order:

1. `q` property in `package.json`
2. `.qrc` (JSON or YAML)
3. `.qrc.json`, `.qrc.yaml`, `.qrc.yml`
4. `q.config.js`, `q.config.mjs`
5. `~/.config/q/config.yaml` (global)

## Example Configuration

```yaml
# ~/.config/q/config.yaml

# Default model
model: sonnet # sonnet | opus | haiku

# Maximum tokens for response
maxTokens: 4096

# Theme variant (affects colors)
theme: neon # neon | vibrant | soft | glow

# Context injection
context:
  git: true # Include git branch, status, recent commits
  cwd: true # Include current working directory
  lastCommand: false # Include previous command output

# Additional system prompt (extends default)
systemPrompt: |
  I prefer concise answers with code examples.
  Use TypeScript for code examples unless otherwise specified.

# Prompt aliases (use with @alias syntax)
prompts:
  explain: 'Explain this error and suggest a fix:'
  review: 'Review this code for issues and improvements:'
  commit: 'Write a conventional commit message for these changes:'
  test: 'Write tests for this code:'

# Safety settings
safety:
  confirmDestructive: true # Always confirm rm, drop, delete, etc.
  maxCostPerQuery: 0.50 # USD limit per query
  blockedCommands: # Never execute these patterns
    - 'rm -rf /'
    - 'sudo rm'
```

## Environment Variables

| Variable            | Description                       |
| ------------------- | --------------------------------- |
| `ANTHROPIC_API_KEY` | Required. Your Anthropic API key. |
| `Q_MODEL`           | Override default model.           |
| `Q_CONFIG`          | Path to config file.              |
| `DEBUG`             | Enable debug output.              |
