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
| `--resume <id>`   | `-r`  | Resume a previous session ("last" for most recent) |
| `--model <model>` | `-m`  | Model to use: sonnet, opus, haiku                  |
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
q -r           # Resume last session
q -r abc123    # Resume specific session
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
