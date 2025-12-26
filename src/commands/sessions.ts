/**
 * Session management commands
 */

import { color, semantic } from '../lib/colors.js';
import { formatCost, formatRelativeTime, SEPARATOR_WIDTH } from '../lib/format.js';
import { listSessions } from '../lib/storage.js';

/**
 * Show recent sessions
 */
export function showSessions(): void {
  const sessions = listSessions(10);

  if (sessions.length === 0) {
    console.log(semantic.muted('No sessions yet'));
    return;
  }

  console.log();
  console.log(color('Recent sessions', 'purple', 'bold'));
  console.log(semantic.muted('─'.repeat(SEPARATOR_WIDTH)));

  for (const s of sessions) {
    const title = s.title ?? semantic.muted('(untitled)');
    const time = formatRelativeTime(s.updatedAt);
    const cost = formatCost(s.totalCost);

    console.log(`  ${color(s.id, 'cyan')} ${title}`);
    console.log(`    ${semantic.muted(`${s.messageCount} msgs │ ${cost} │ ${s.model} │ ${time}`)}`);
  }

  console.log();
  console.log(semantic.muted('Resume with: q -r <id> or q -r last'));
}
