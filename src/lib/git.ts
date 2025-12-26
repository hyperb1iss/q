/**
 * Git utilities for q
 *
 * Provides async git operations for context gathering.
 */

export interface GitInfo {
  branch: string;
  status: 'clean' | 'dirty';
}

/**
 * Run a git command asynchronously
 */
async function runGit(args: string[]): Promise<{ ok: boolean; output: string }> {
  const proc = Bun.spawn(['git', ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await proc.exited;
  const output = await new Response(proc.stdout).text();
  return { ok: exitCode === 0, output: output.trim() };
}

/**
 * Get git info for the current directory
 * Returns null if not in a git repo
 */
export async function getGitInfo(): Promise<GitInfo | null> {
  try {
    // Check if we're in a git repo
    const { ok: isRepo } = await runGit(['rev-parse', '--is-inside-work-tree']);
    if (!isRepo) return null;

    // Get branch name
    const { ok: hasBranch, output: branch } = await runGit(['branch', '--show-current']);
    if (!hasBranch || !branch) return null;

    // Check if dirty (git diff returns non-zero if dirty)
    const { ok: isClean } = await runGit(['diff', '--quiet']);
    const { ok: isCacheClean } = await runGit(['diff', '--cached', '--quiet']);

    return {
      branch,
      status: isClean && isCacheClean ? 'clean' : 'dirty',
    };
  } catch {
    return null;
  }
}

/**
 * Check if current directory is inside a git repository
 */
export async function isGitRepo(): Promise<boolean> {
  const { ok } = await runGit(['rev-parse', '--is-inside-work-tree']);
  return ok;
}

/**
 * Get current git branch name
 * Returns null if not in a git repo or no branch
 */
export async function getGitBranch(): Promise<string | null> {
  const { ok, output } = await runGit(['branch', '--show-current']);
  return ok && output ? output : null;
}
