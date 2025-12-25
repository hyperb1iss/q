#!/usr/bin/env zsh
# q - Shell Integration for Zsh
#
# Installation:
#   Add to your ~/.zshrc:
#     source /path/to/q/shell/q.zsh
#
#   Or if installed globally:
#     eval "$(q --shell-init zsh)"
#
# Features:
#   - Ctrl+Q: Quick query with context
#   - qq: Quick query alias
#   - q!: Query with last command context
#   - q?: Explain last error
#   - Ghostty integration for enhanced output

# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

# Customizable hotkey (default: Ctrl+Q)
Q_HOTKEY="${Q_HOTKEY:-^Q}"

# Max lines of last command output to capture
Q_MAX_OUTPUT_LINES="${Q_MAX_OUTPUT_LINES:-50}"

# Enable Ghostty enhancements
Q_GHOSTTY_ENABLED="${Q_GHOSTTY_ENABLED:-1}"

# ─────────────────────────────────────────────────────────────────────────────
# Terminal Detection
# ─────────────────────────────────────────────────────────────────────────────

_q_is_ghostty() {
  [[ "$TERM_PROGRAM" == "ghostty" ]] || [[ -n "$GHOSTTY_RESOURCES_DIR" ]]
}

_q_is_kitty() {
  [[ "$TERM" == "xterm-kitty" ]]
}

_q_is_iterm() {
  [[ "$TERM_PROGRAM" == "iTerm.app" ]]
}

# ─────────────────────────────────────────────────────────────────────────────
# Ghostty OSC Sequences
# ─────────────────────────────────────────────────────────────────────────────

# Send notification via OSC 9
_q_notify() {
  if _q_is_ghostty && [[ "$Q_GHOSTTY_ENABLED" == "1" ]]; then
    printf '\e]9;%s\e\\' "$1"
  elif _q_is_iterm; then
    printf '\e]9;%s\007' "$1"
  fi
}

# Create hyperlink via OSC 8
_q_hyperlink() {
  local url="$1"
  local text="$2"
  printf '\e]8;;%s\e\\%s\e]8;;\e\\' "$url" "$text"
}

# Set terminal title
_q_set_title() {
  printf '\e]0;%s\e\\' "$1"
}

# Mark output region (for Ghostty semantic prompts)
_q_mark_output_start() {
  if _q_is_ghostty; then
    printf '\e]133;C\e\\'
  fi
}

_q_mark_output_end() {
  if _q_is_ghostty; then
    printf '\e]133;D;%s\e\\' "$1"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Context Capture
# ─────────────────────────────────────────────────────────────────────────────

# Store last command and exit status
typeset -g _Q_LAST_CMD=""
typeset -g _Q_LAST_STATUS=0
typeset -g _Q_LAST_OUTPUT=""
typeset -g _Q_CMD_START_TIME=0

# Capture command before execution
_q_preexec() {
  _Q_LAST_CMD="$1"
  _Q_CMD_START_TIME=$EPOCHSECONDS
}

# Capture exit status after execution
_q_precmd() {
  _Q_LAST_STATUS=$?
}

# Hook into zsh
autoload -Uz add-zsh-hook
add-zsh-hook preexec _q_preexec
add-zsh-hook precmd _q_precmd

# ─────────────────────────────────────────────────────────────────────────────
# Git Context
# ─────────────────────────────────────────────────────────────────────────────

_q_git_context() {
  if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    return
  fi

  local branch=$(git branch --show-current 2>/dev/null)
  local status=""

  # Check for uncommitted changes
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    status="dirty"
  else
    status="clean"
  fi

  # Get recent commits
  local commits=$(git log --oneline -3 2>/dev/null | head -3)

  cat <<EOF
Git branch: $branch
Git status: $status
Recent commits:
$commits
EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# Context Builder
# ─────────────────────────────────────────────────────────────────────────────

_q_build_context() {
  local include_cmd="${1:-0}"
  local include_error="${2:-0}"

  echo "─── Context ───"
  echo "Directory: $PWD"
  echo ""

  # Git context
  local git_ctx=$(_q_git_context)
  if [[ -n "$git_ctx" ]]; then
    echo "$git_ctx"
    echo ""
  fi

  # Last command context
  if [[ "$include_cmd" == "1" && -n "$_Q_LAST_CMD" ]]; then
    echo "Last command: $_Q_LAST_CMD"
    echo "Exit status: $_Q_LAST_STATUS"

    if [[ $_Q_LAST_STATUS -ne 0 ]]; then
      echo "⚠️  Command failed!"
    fi
    echo ""
  fi

  # Error context
  if [[ "$include_error" == "1" && $_Q_LAST_STATUS -ne 0 ]]; then
    echo "Error: The last command failed with exit code $_Q_LAST_STATUS"
    echo "Command: $_Q_LAST_CMD"
    echo ""
  fi

  echo "───────────────"
}

# ─────────────────────────────────────────────────────────────────────────────
# Main Functions
# ─────────────────────────────────────────────────────────────────────────────

# Quick query widget for hotkey
_q_quick_query() {
  local query="$BUFFER"

  if [[ -z "$query" ]]; then
    # No input - open interactive mode
    BUFFER=""
    zle reset-prompt
    q -i
  else
    # Use buffer as query with context
    BUFFER=""
    zle reset-prompt
    echo ""
    _q_build_context 1
    echo ""
    q "$query"
  fi

  zle reset-prompt
}

# Register as zle widget
zle -N _q_quick_query

# Bind hotkey
bindkey "$Q_HOTKEY" _q_quick_query

# ─────────────────────────────────────────────────────────────────────────────
# Aliases & Commands
# ─────────────────────────────────────────────────────────────────────────────

# qq - Quick query with directory context
qq() {
  if [[ $# -eq 0 ]]; then
    q -i
  else
    q "$@"
  fi
}

# q! - Query with last command context
q!() {
  local context=$(_q_build_context 1)

  if [[ $# -eq 0 ]]; then
    echo "$context"
    echo ""
    q -i
  else
    q "$context

$*"
  fi
}

# q? - Explain last error
q?() {
  if [[ $_Q_LAST_STATUS -eq 0 ]]; then
    echo "✓ Last command succeeded (exit code 0)"
    return 0
  fi

  local context=$(_q_build_context 0 1)
  local prompt="${*:-Explain this error and suggest how to fix it}"

  q "$context

$prompt"
}

# qx - Execute mode with context
qx() {
  q -x "$@"
}

# qr - Resume last session
qr() {
  q -r last "$@"
}

# ─────────────────────────────────────────────────────────────────────────────
# Ghostty-Specific Features
# ─────────────────────────────────────────────────────────────────────────────

if _q_is_ghostty && [[ "$Q_GHOSTTY_ENABLED" == "1" ]]; then
  # Notify when long q query completes
  _q_notify_complete() {
    local duration=$((EPOCHSECONDS - _Q_CMD_START_TIME))
    if [[ $duration -gt 30 ]]; then
      _q_notify "q query completed (${duration}s)"
    fi
  }
  add-zsh-hook precmd _q_notify_complete
fi

# ─────────────────────────────────────────────────────────────────────────────
# Completion
# ─────────────────────────────────────────────────────────────────────────────

_q_completions() {
  local -a opts
  opts=(
    '-i:Interactive TUI mode'
    '-x:Execute mode with tools'
    '-r:Resume session'
    '-m:Model selection'
    '--sessions:List recent sessions'
    '--help:Show help'
  )
  _describe 'q options' opts
}

compdef _q_completions q qq qx qr

# ─────────────────────────────────────────────────────────────────────────────
# Status Message
# ─────────────────────────────────────────────────────────────────────────────

if [[ -z "$Q_QUIET" ]]; then
  if _q_is_ghostty; then
    echo "⚡ q shell integration loaded (Ghostty enhanced)"
  else
    echo "⚡ q shell integration loaded"
  fi
  echo "   Ctrl+Q: quick query | qq: alias | q!: with context | q?: explain error"
fi
