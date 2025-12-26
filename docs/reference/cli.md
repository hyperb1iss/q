# CLI Reference

## Usage

```
q [query] [options]
```

## Arguments

| Argument | Description                                           |
| -------- | ----------------------------------------------------- |
| `query`  | The question or prompt (optional in interactive mode) |

## Options

| Option            | Alias | Description                                        |
| ----------------- | ----- | -------------------------------------------------- |
| `--interactive`   | `-i`  | Open interactive TUI mode                          |
| `--execute`       | `-x`  | Enable agent tools (Read, Glob, Grep, Bash)        |
| `--dry-run`       |       | Show tools without executing (use with `-x`)       |
| `--resume <id>`   | `-r`  | Resume a previous session ("last" for most recent) |
| `--continue`      | `-c`  | Continue last session (shortcut for `-r last`)     |
| `--model <model>` | `-m`  | Model to use: sonnet, opus, haiku                  |
| `--file <path>`   | `-f`  | Include file(s) as context (can be repeated)       |
| `--quiet`         | `-q`  | Minimal output (response only)                     |
| `--verbose`       | `-v`  | Show token/cost stats                              |
| `--raw`           |       | Raw output without markdown formatting             |
| `--json`          |       | Output response as JSON                            |
| `--sessions`      |       | List recent sessions                               |
| `--no-config`     |       | Skip loading config files (security)               |
| `--color <mode>`  |       | Color mode: auto, always, never                    |
| `--version`       |       | Show version number                                |
| `--help`          |       | Show help                                          |

## Examples

### Quick Query

```bash
q "what does this error mean"
q "how do I rebase onto main"
```

### Pipe Mode

```bash
cat error.log | q "explain this"
git diff | q "summarize these changes"
pbpaste | q "review this code"
```

### Interactive Mode

```bash
q          # Opens TUI
q -i       # Explicit flag
```

### Execute Mode

```bash
q -x "find all TODO comments"
q --execute "run tests and fix failures"
```

### Resume Session

```bash
q -c           # Continue last session
q -r last      # Equivalent to -c
q -r abc123    # Resume specific session
```

### Dry Run

```bash
q -x --dry-run "refactor this"  # See what tools would run
```

### Include Files

```bash
q -f src/app.ts "explain this"
q -f src/*.ts "review these files"
```

### Output Formats

```bash
q --json "query"     # JSON output
q --raw "query"      # No markdown formatting
q -q "query"         # Minimal output
```

### Model Selection

```bash
q -m opus "complex question"
q -m haiku "quick question"
```

## Exit Codes

| Code | Meaning                               |
| ---- | ------------------------------------- |
| 0    | Success                               |
| 1    | Error (invalid args, API error, etc.) |
| 130  | Interrupted (Ctrl+C)                  |
