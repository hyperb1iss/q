#!/usr/bin/env fish
# q - Shell Integration for Fish
#
# Installation:
#   Add to your ~/.config/fish/config.fish:
#     source /path/to/q/shell/q.fish
#
#   Or if installed globally:
#     q --shell-init fish | source
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

# Max lines of last command output to capture
set -q Q_MAX_OUTPUT_LINES; or set -g Q_MAX_OUTPUT_LINES 50

# Enable Ghostty enhancements
set -q Q_GHOSTTY_ENABLED; or set -g Q_GHOSTTY_ENABLED 1

# ─────────────────────────────────────────────────────────────────────────────
# Terminal Detection
# ─────────────────────────────────────────────────────────────────────────────

function _q_is_ghostty
  test "$TERM_PROGRAM" = "ghostty"; or test -n "$GHOSTTY_RESOURCES_DIR"
end

function _q_is_kitty
  test "$TERM" = "xterm-kitty"
end

function _q_is_iterm
  test "$TERM_PROGRAM" = "iTerm.app"
end

# ─────────────────────────────────────────────────────────────────────────────
# Ghostty OSC Sequences
# ─────────────────────────────────────────────────────────────────────────────

# Send notification via OSC 9
function _q_notify
  if _q_is_ghostty; and test "$Q_GHOSTTY_ENABLED" = "1"
    printf '\e]9;%s\e\\' "$argv[1]"
  else if _q_is_iterm
    printf '\e]9;%s\007' "$argv[1]"
  end
end

# Create hyperlink via OSC 8
function _q_hyperlink
  set -l url $argv[1]
  set -l text $argv[2]
  printf '\e]8;;%s\e\\%s\e]8;;\e\\' "$url" "$text"
end

# Set terminal title
function _q_set_title
  printf '\e]0;%s\e\\' "$argv[1]"
end

# Mark output region (for Ghostty semantic prompts)
function _q_mark_output_start
  if _q_is_ghostty
    printf '\e]133;C\e\\'
  end
end

function _q_mark_output_end
  if _q_is_ghostty
    printf '\e]133;D;%s\e\\' "$argv[1]"
  end
end

# ─────────────────────────────────────────────────────────────────────────────
# Context Capture
# ─────────────────────────────────────────────────────────────────────────────

# Store last command and exit status
set -g _Q_LAST_CMD ""
set -g _Q_LAST_STATUS 0
set -g _Q_CMD_START_TIME 0

# Capture command before execution
function _q_preexec --on-event fish_preexec
  set -g _Q_LAST_CMD $argv[1]
  set -g _Q_CMD_START_TIME (date +%s)
end

# Capture exit status after execution
function _q_postexec --on-event fish_postexec
  set -g _Q_LAST_STATUS $status
end

# ─────────────────────────────────────────────────────────────────────────────
# Git Context
# ─────────────────────────────────────────────────────────────────────────────

function _q_git_context
  if not git rev-parse --is-inside-work-tree &>/dev/null
    return
  end

  set -l branch (git branch --show-current 2>/dev/null)
  set -l git_status ""

  # Check for uncommitted changes
  if not git diff --quiet 2>/dev/null; or not git diff --cached --quiet 2>/dev/null
    set git_status "dirty"
  else
    set git_status "clean"
  end

  # Get recent commits
  set -l commits (git log --oneline -3 2>/dev/null | head -3)

  echo "Git branch: $branch"
  echo "Git status: $git_status"
  echo "Recent commits:"
  echo "$commits"
end

# ─────────────────────────────────────────────────────────────────────────────
# Context Builder
# ─────────────────────────────────────────────────────────────────────────────

function _q_build_context
  set -l include_cmd $argv[1]
  set -l include_error $argv[2]

  echo "─── Context ───"
  echo "Directory: $PWD"
  echo ""

  # Git context
  set -l git_ctx (_q_git_context)
  if test -n "$git_ctx"
    echo "$git_ctx"
    echo ""
  end

  # Last command context
  if test "$include_cmd" = "1"; and test -n "$_Q_LAST_CMD"
    echo "Last command: $_Q_LAST_CMD"
    echo "Exit status: $_Q_LAST_STATUS"

    if test $_Q_LAST_STATUS -ne 0
      echo "⚠️  Command failed!"
    end
    echo ""
  end

  # Error context
  if test "$include_error" = "1"; and test $_Q_LAST_STATUS -ne 0
    echo "Error: The last command failed with exit code $_Q_LAST_STATUS"
    echo "Command: $_Q_LAST_CMD"
    echo ""
  end

  echo "───────────────"
end

# ─────────────────────────────────────────────────────────────────────────────
# Main Functions
# ─────────────────────────────────────────────────────────────────────────────

# Quick query widget for hotkey
function _q_quick_query
  set -l query (commandline)

  if test -z "$query"
    # No input - open interactive mode
    commandline -r ""
    q -i
  else
    # Use buffer as query with context
    commandline -r ""
    echo ""
    _q_build_context 1
    echo ""
    q "$query"
  end

  commandline -f repaint
end

# Bind Ctrl+Q
bind \cq _q_quick_query

# ─────────────────────────────────────────────────────────────────────────────
# Aliases & Commands
# ─────────────────────────────────────────────────────────────────────────────

# qq - Quick query with directory context
function qq
  if test (count $argv) -eq 0
    q -i
  else
    q $argv
  end
end

# q! - Query with last command context
function q!
  set -l context (_q_build_context 1)

  if test (count $argv) -eq 0
    echo "$context"
    echo ""
    q -i
  else
    # Safely join arguments
    set -l prompt (string join " " $argv)
    q "$context

$prompt"
  end
end

# q? - Explain last error
function q\?
  if test $_Q_LAST_STATUS -eq 0
    echo "✓ Last command succeeded (exit code 0)"
    return 0
  end

  set -l context (_q_build_context 0 1)
  set -l prompt "Explain this error and suggest how to fix it"
  if test (count $argv) -gt 0
    set prompt (string join " " $argv)
  end

  q "$context

$prompt"
end

# qx - Execute mode with context
function qx
  q -x $argv
end

# qr - Resume last session
function qr
  q -r last $argv
end

# ─────────────────────────────────────────────────────────────────────────────
# Ghostty-Specific Features
# ─────────────────────────────────────────────────────────────────────────────

if _q_is_ghostty; and test "$Q_GHOSTTY_ENABLED" = "1"
  # Notify when long q query completes
  function _q_notify_complete --on-event fish_postexec
    if test -n "$_Q_CMD_START_TIME"
      set -l duration (math (date +%s) - $_Q_CMD_START_TIME)
      if test $duration -gt 30
        _q_notify "q query completed ($duration""s)"
      end
    end
  end
end

# ─────────────────────────────────────────────────────────────────────────────
# Completion
# ─────────────────────────────────────────────────────────────────────────────

complete -c q -s i -d 'Interactive TUI mode'
complete -c q -s x -d 'Execute mode with tools'
complete -c q -s r -d 'Resume session'
complete -c q -s m -d 'Model selection'
complete -c q -l sessions -d 'List recent sessions'
complete -c q -l help -d 'Show help'

complete -c qq -w q
complete -c qx -w q
complete -c qr -w q

# ─────────────────────────────────────────────────────────────────────────────
# Status Message
# ─────────────────────────────────────────────────────────────────────────────

if not set -q Q_QUIET
  if _q_is_ghostty
    echo "⚡ q shell integration loaded (Ghostty enhanced)"
  else
    echo "⚡ q shell integration loaded"
  end
  echo "   Ctrl+Q: quick query | qq: alias | q!: with context | q?: explain error"
end
