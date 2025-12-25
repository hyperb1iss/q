#!/usr/bin/env fish
# q - Shell Integration for Fish
#
# Installation:
#   q --shell-init fish | source
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

set -g _Q_LAST_CMD ""
set -g _Q_LAST_STATUS 0
set -g _Q_PREV_CMD ""
set -g _Q_PREV_STATUS 0

function _q_preexec --on-event fish_preexec
  # Save previous before overwriting
  set -g _Q_PREV_CMD "$_Q_LAST_CMD"
  set -g _Q_PREV_STATUS "$_Q_LAST_STATUS"
  set -g _Q_LAST_CMD "$argv[1]"
end

function _q_postexec --on-event fish_postexec
  set -g _Q_LAST_STATUS $status
end

# ─────────────────────────────────────────────────────────────────────────────
# Git Context
# ─────────────────────────────────────────────────────────────────────────────

function _q_git_context
  git rev-parse --is-inside-work-tree &>/dev/null; or return

  set -l branch (git branch --show-current 2>/dev/null)
  set -l state "clean"

  if not git diff --quiet 2>/dev/null; or not git diff --cached --quiet 2>/dev/null
    set state "dirty"
  end

  echo "Git: $branch ($state)"
end

# ─────────────────────────────────────────────────────────────────────────────
# Context Builder
# ─────────────────────────────────────────────────────────────────────────────

function _q_build_context
  set -l include_cmd $argv[1]
  set -l include_error $argv[2]
  set -l cmd "$_Q_PREV_CMD"
  set -l exit_status "$_Q_PREV_STATUS"

  echo "─── Context ───"
  echo "Directory: $PWD"

  set -l git_ctx (_q_git_context)
  test -n "$git_ctx"; and echo "$git_ctx"

  if test "$include_cmd" = "1"; and test -n "$cmd"
    echo ""
    echo "Last command: $cmd"
    echo "Exit status: $exit_status"
  end

  if test "$include_error" = "1"; and test "$exit_status" -ne 0
    echo ""
    echo "⚠ Command failed with exit code $exit_status"
    echo "Command: $cmd"
  end

  echo "────────────────"
end

# ─────────────────────────────────────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────────────────────────────────────

# qq - Quick query
function qq
  if test (count $argv) -eq 0
    command q -i
  else
    command q $argv
  end
end

# qctx - Query with last command context
function qctx
  set -l context (_q_build_context 1)

  if test (count $argv) -eq 0
    echo "$context"
    echo ""
    command q -i
  else
    set -l prompt (string join " " $argv)
    command q "$context

$prompt"
  end
end

# qerr - Explain last error
function qerr
  if test "$_Q_PREV_STATUS" -eq 0
    echo "✓ Last command succeeded"
    return 0
  end

  set -l context (_q_build_context 0 1)
  set -l prompt "Explain this error and suggest how to fix it"
  if test (count $argv) -gt 0
    set prompt (string join " " $argv)
  end

  command q "$context

$prompt"
end

# qx - Execute mode
function qx
  command q -x $argv
end

# qr - Resume last session
function qr
  command q -r last $argv
end

# ─────────────────────────────────────────────────────────────────────────────
# Hotkey (Ctrl+Q)
# ─────────────────────────────────────────────────────────────────────────────

function _q_widget
  set -l query (commandline)

  if test -z "$query"
    # Empty buffer - just insert 'qq ' to start a query
    commandline -r "qq "
    commandline -f end-of-line
    return
  end

  # Run query with current buffer content
  commandline -r ""
  echo ""
  command q "$query"
  commandline -f repaint
end

bind \cq _q_widget

# ─────────────────────────────────────────────────────────────────────────────
# Completion
# ─────────────────────────────────────────────────────────────────────────────

complete -c q -s i -d 'Interactive mode'
complete -c q -s x -d 'Execute mode with tools'
complete -c q -s r -d 'Resume session'
complete -c q -s m -d 'Model (sonnet, opus, haiku)'
complete -c q -s v -d 'Verbose output'
complete -c q -s q -d 'Quiet mode'
complete -c q -l sessions -d 'List sessions'
complete -c q -l help -d 'Show help'

complete -c qq -w q
complete -c qctx -w q
complete -c qerr -w q
complete -c qx -w q
complete -c qr -w q

# ─────────────────────────────────────────────────────────────────────────────
# Init Message
# ─────────────────────────────────────────────────────────────────────────────

if not set -q Q_QUIET
  echo "⚡ q: qq qctx qerr qx qr | Ctrl+Q"
end
