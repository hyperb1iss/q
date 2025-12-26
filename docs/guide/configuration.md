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

## Project Context

Create a `.q/context.md` file in your project root to add project-specific context that gets automatically included in every query. This is useful for:

- Project conventions and coding standards
- Architecture notes
- Common tasks and workflows
- Team-specific instructions

```markdown
<!-- .q/context.md -->
# My Project

- This is a TypeScript + React project
- We use Tailwind CSS for styling
- Run tests with `bun test`
- Follow conventional commits
```

The context file is searched in this order:
1. `.q/context.md`
2. `.q/CONTEXT.md`
3. `CONTEXT.md`

## Security Considerations

### Code Execution in Config Files

JavaScript config files (`q.config.js`, `q.config.mjs`, `q.config.ts`) are **executed** when loaded. This is a feature that enables dynamic configuration, but has security implications:

- Only use config files you trust
- Be cautious running `q` in untrusted directories that may contain malicious config files
- Use `--no-config` to skip config loading entirely when running in untrusted contexts

```bash
# Skip all config files (safe mode)
q --no-config "explain this error"
```

### Shell Integration

When using shell integration (`eval "$(q --shell-init zsh)"`), be aware that:

- The integration captures your working directory and shell environment
- This context is sent to the Claude API with each query
- Use environment variables to exclude sensitive directories if needed

## Environment Variables

| Variable            | Description                       |
| ------------------- | --------------------------------- |
| `ANTHROPIC_API_KEY` | Required. Your Anthropic API key. |
| `Q_MODEL`           | Override default model.           |
| `Q_CONFIG`          | Path to config file.              |
| `DEBUG`             | Enable debug output.              |
