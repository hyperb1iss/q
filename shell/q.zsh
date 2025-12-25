#!/usr/bin/env zsh
# q - Shell Integration for Zsh
#
# Installation:
#   eval "$(q --shell-init zsh)"
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

typeset -g _Q_LAST_CMD=""
typeset -g _Q_LAST_STATUS=0
typeset -g _Q_PREV_CMD=""
typeset -g _Q_PREV_STATUS=0

_q_preexec() {
  # Save previous before overwriting (so qerr can access the real last command)
  _Q_PREV_CMD="$_Q_LAST_CMD"
  _Q_PREV_STATUS="$_Q_LAST_STATUS"
  _Q_LAST_CMD="$1"
}

_q_precmd() {
  _Q_LAST_STATUS=$?
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec _q_preexec
add-zsh-hook precmd _q_precmd

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
  local query="$BUFFER"

  if [[ -z "$query" ]]; then
    # Empty buffer - just insert 'qq ' to start a query
    BUFFER="qq "
    # shellcheck disable=SC2034  # CURSOR is used by zle
    CURSOR=${#BUFFER}
    return
  fi

  # Run query with current buffer content
  BUFFER=""
  zle reset-prompt
  echo ""
  command q "$query"
  zle reset-prompt
}

zle -N _q_widget

# Disable flow control to free Ctrl+Q
stty -ixon 2>/dev/null

bindkey '^Q' _q_widget

# ─────────────────────────────────────────────────────────────────────────────
# Completion
# ─────────────────────────────────────────────────────────────────────────────

_q_complete() {
  local -a opts
  # shellcheck disable=SC2034  # opts is used by _describe
  opts=(
    '-i:Interactive mode'
    '-x:Execute mode with tools'
    '-r:Resume session'
    '-m:Model (sonnet, opus, haiku)'
    '-v:Verbose output'
    '-q:Quiet mode'
    '--sessions:List sessions'
    '--help:Show help'
  )
  _describe 'q options' opts
}

compdef _q_complete q qq qctx qerr qx qr

# ─────────────────────────────────────────────────────────────────────────────
# Init Message
# ─────────────────────────────────────────────────────────────────────────────

[[ -z "$Q_QUIET" ]] && echo "⚡ q: qq qctx qerr qx qr | Ctrl+Q"
