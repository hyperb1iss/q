#!/usr/bin/env bash
# q - Shell Integration for Bash
#
# Installation:
#   eval "$(q --shell-init bash)"
#
# Commands:
#   qq      - Quick query (or interactive if no args)
#   qctx    - Query with last command context
#   qerr    - Explain last error
#   qx      - Execute mode with tools
#   qr      - Resume last session
#
# Hotkey:
#   Ctrl+Q  - Quick query widget

# ─────────────────────────────────────────────────────────────────────────────
# Context Capture
# ─────────────────────────────────────────────────────────────────────────────

_Q_LAST_CMD=""
_Q_LAST_STATUS=0
_Q_PREV_CMD=""
_Q_PREV_STATUS=0

_q_prompt_command() {
  local current_status=$?
  local current_cmd
  current_cmd=$(history 1 | sed 's/^[ ]*[0-9]*[ ]*//')

  # Save previous before overwriting (so qerr can access the real last command)
  _Q_PREV_CMD="$_Q_LAST_CMD"
  _Q_PREV_STATUS="$_Q_LAST_STATUS"
  _Q_LAST_CMD="$current_cmd"
  _Q_LAST_STATUS="$current_status"
}

if [[ -z "$PROMPT_COMMAND" ]]; then
  PROMPT_COMMAND="_q_prompt_command"
else
  PROMPT_COMMAND="_q_prompt_command; $PROMPT_COMMAND"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Git Context
# ─────────────────────────────────────────────────────────────────────────────

_q_git_context() {
  git rev-parse --is-inside-work-tree &>/dev/null || return

  local branch
  branch=$(git branch --show-current 2>/dev/null)
  local state="clean"

  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    state="dirty"
  fi

  echo "Git: $branch ($state)"
}

# ─────────────────────────────────────────────────────────────────────────────
# Context Builder
# ─────────────────────────────────────────────────────────────────────────────

_q_build_context() {
  local include_cmd="${1:-0}"
  local include_error="${2:-0}"
  local cmd="$_Q_PREV_CMD"
  local exit_status="$_Q_PREV_STATUS"

  echo "─── Context ───"
  echo "Directory: $PWD"

  local git_ctx
  git_ctx=$(_q_git_context)
  [[ -n "$git_ctx" ]] && echo "$git_ctx"

  if [[ "$include_cmd" == "1" && -n "$cmd" ]]; then
    echo ""
    echo "Last command: $cmd"
    echo "Exit status: $exit_status"
  fi

  if [[ "$include_error" == "1" && $exit_status -ne 0 ]]; then
    echo ""
    echo "⚠ Command failed with exit code $exit_status"
    echo "Command: $cmd"
  fi

  echo "────────────────"
}

# ─────────────────────────────────────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────────────────────────────────────

# qq - Quick query
qq() {
  if [[ $# -eq 0 ]]; then
    command q -i
  else
    command q "$@"
  fi
}

# qctx - Query with last command context
qctx() {
  local context
  context=$(_q_build_context 1)

  if [[ $# -eq 0 ]]; then
    echo "$context"
    echo ""
    command q -i
  else
    command q "${context}

$*"
  fi
}

# qerr - Explain last error
qerr() {
  if [[ $_Q_PREV_STATUS -eq 0 ]]; then
    echo "✓ Last command succeeded"
    return 0
  fi

  local context
  context=$(_q_build_context 0 1)
  local prompt="${*:-Explain this error and suggest how to fix it}"

  command q "${context}

${prompt}"
}

# qx - Execute mode
qx() {
  command q -x "$@"
}

# qr - Resume last session
qr() {
  command q -r last "$@"
}

# ─────────────────────────────────────────────────────────────────────────────
# Hotkey (Ctrl+Q)
# ─────────────────────────────────────────────────────────────────────────────

_q_widget() {
  local query="$READLINE_LINE"

  if [[ -z "$query" ]]; then
    # Empty buffer - just insert 'qq ' to start a query
    READLINE_LINE="qq "
    READLINE_POINT=${#READLINE_LINE}
    return
  fi

  # Run query with current buffer content
  READLINE_LINE=""
  READLINE_POINT=0
  echo ""
  command q "$query"
}

# Disable flow control to free Ctrl+Q
stty -ixon 2>/dev/null

bind -x '"\C-q": _q_widget'

# ─────────────────────────────────────────────────────────────────────────────
# Completion
# ─────────────────────────────────────────────────────────────────────────────

_q_completions() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  local opts="-i -x -r -m -v -q --sessions --help"
  mapfile -t COMPREPLY < <(compgen -W "$opts" -- "$cur")
}

complete -F _q_completions q qq qctx qerr qx qr

# ─────────────────────────────────────────────────────────────────────────────
# Init Message
# ─────────────────────────────────────────────────────────────────────────────

[[ -z "$Q_QUIET" ]] && echo "⚡ q: qq qctx qerr qx qr | Ctrl+Q"
