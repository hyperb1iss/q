/**
 * Tests for SQLite session storage
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  addMessage,
  closeDb,
  createSession,
  deleteSession,
  getLastSession,
  getSession,
  listSessions,
  updateSdkSessionId,
  updateSessionStats,
} from './storage.js';

describe('storage', () => {
  const testSessionIds: string[] = [];

  // Helper to track sessions for cleanup
  const trackSession = (id: string) => {
    testSessionIds.push(id);
    return id;
  };

  beforeAll(() => {
    // Tests use the real database (creates in data dir)
  });

  afterAll(() => {
    // Clean up all test data
    for (const id of testSessionIds) {
      try {
        deleteSession(id);
      } catch {
        // Ignore errors during cleanup
      }
    }
    closeDb();
  });

  describe('createSession', () => {
    test('creates a session with basic fields', () => {
      const session = createSession('claude-sonnet-4', '/tmp/test');
      trackSession(session.id);

      expect(session.id).toBeDefined();
      expect(session.id.length).toBe(16); // Crypto-secure hex ID
      expect(session.model).toBe('claude-sonnet-4');
      expect(session.messages).toEqual([]);
      expect(session.totalTokens).toBe(0);
      expect(session.totalCost).toBe(0);
      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
      expect(session.updatedAt).toBeLessThanOrEqual(Date.now());
    });

    test('creates session without cwd', () => {
      const session = createSession('claude-opus-4');
      trackSession(session.id);

      expect(session.id).toBeDefined();
      expect(session.model).toBe('claude-opus-4');
    });

    test('creates multiple unique sessions', () => {
      const session1 = createSession('model-1');
      const session2 = createSession('model-2');
      trackSession(session1.id);
      trackSession(session2.id);

      expect(session1.id).not.toBe(session2.id);
    });
  });

  describe('addMessage', () => {
    let sessionId: string;

    beforeEach(() => {
      const session = createSession('test-model');
      sessionId = trackSession(session.id);
    });

    test('adds user message with tokens', () => {
      const msg = addMessage(sessionId, 'user', 'Hello, Claude!', 5);

      expect(msg.id).toBeDefined();
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('Hello, Claude!');
      expect(msg.tokens).toBe(5);
      expect(msg.timestamp).toBeLessThanOrEqual(Date.now());
    });

    test('adds assistant message', () => {
      const msg = addMessage(sessionId, 'assistant', 'Hello! How can I help?', 10);

      expect(msg.role).toBe('assistant');
      expect(msg.content).toBe('Hello! How can I help?');
      expect(msg.tokens).toBe(10);
    });

    test('adds system message', () => {
      const msg = addMessage(sessionId, 'system', 'You are a helpful assistant.');

      expect(msg.role).toBe('system');
      expect(msg.content).toBe('You are a helpful assistant.');
    });

    test('adds message without tokens', () => {
      const msg = addMessage(sessionId, 'user', 'No tokens here');

      expect(msg.tokens).toBeUndefined();
    });

    test('handles empty content', () => {
      const msg = addMessage(sessionId, 'user', '');

      expect(msg.content).toBe('');
    });

    test('handles long content', () => {
      const longContent = 'x'.repeat(10000);
      const msg = addMessage(sessionId, 'user', longContent);

      expect(msg.content).toBe(longContent);
      expect(msg.content.length).toBe(10000);
    });

    test('handles special characters', () => {
      const specialContent = 'Line 1\nLine 2\tTabbed\r\n"Quoted" \'Single\' `Backticks`';
      const msg = addMessage(sessionId, 'user', specialContent);

      expect(msg.content).toBe(specialContent);
    });

    test('handles unicode content', () => {
      const unicodeContent = '你好世界 🌍 مرحبا العالم';
      const msg = addMessage(sessionId, 'user', unicodeContent);

      expect(msg.content).toBe(unicodeContent);
    });

    test('updates session timestamp on message add', () => {
      const before = Date.now();
      addMessage(sessionId, 'user', 'Test');
      const session = getSession(sessionId);

      expect(session?.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe('getSession', () => {
    test('retrieves session with messages', () => {
      const created = createSession('retrieve-test');
      trackSession(created.id);

      addMessage(created.id, 'user', 'First message', 5);
      addMessage(created.id, 'assistant', 'Second message', 10);

      const session = getSession(created.id);

      expect(session).not.toBeNull();
      expect(session?.messages.length).toBe(2);
      expect(session?.messages[0].role).toBe('user');
      expect(session?.messages[0].content).toBe('First message');
      expect(session?.messages[0].tokens).toBe(5);
      expect(session?.messages[1].role).toBe('assistant');
      expect(session?.messages[1].content).toBe('Second message');
      expect(session?.messages[1].tokens).toBe(10);
    });

    test('returns messages in chronological order', async () => {
      const session = createSession('order-test');
      trackSession(session.id);

      addMessage(session.id, 'user', 'First');
      await new Promise(r => setTimeout(r, 10)); // Small delay
      addMessage(session.id, 'assistant', 'Second');
      await new Promise(r => setTimeout(r, 10));
      addMessage(session.id, 'user', 'Third');

      const retrieved = getSession(session.id);
      expect(retrieved?.messages[0].content).toBe('First');
      expect(retrieved?.messages[1].content).toBe('Second');
      expect(retrieved?.messages[2].content).toBe('Third');
    });

    test('returns null for non-existent session', () => {
      const session = getSession('nonexistent123');
      expect(session).toBeNull();
    });

    test('returns session without SDK session ID when not set', () => {
      const created = createSession('no-sdk-id');
      trackSession(created.id);

      const session = getSession(created.id);
      expect(session?.sdkSessionId).toBeUndefined();
    });
  });

  describe('updateSdkSessionId', () => {
    test('stores SDK session ID', () => {
      const session = createSession('sdk-test');
      trackSession(session.id);

      updateSdkSessionId(session.id, 'sdk_abc123xyz');

      const retrieved = getSession(session.id);
      expect(retrieved?.sdkSessionId).toBe('sdk_abc123xyz');
    });

    test('updates existing SDK session ID', () => {
      const session = createSession('sdk-update-test');
      trackSession(session.id);

      updateSdkSessionId(session.id, 'first_id');
      updateSdkSessionId(session.id, 'second_id');

      const retrieved = getSession(session.id);
      expect(retrieved?.sdkSessionId).toBe('second_id');
    });

    test('handles long SDK session ID', () => {
      const session = createSession('long-sdk-id');
      trackSession(session.id);

      const longId = `sdk_${'x'.repeat(200)}`;
      updateSdkSessionId(session.id, longId);

      const retrieved = getSession(session.id);
      expect(retrieved?.sdkSessionId).toBe(longId);
    });
  });

  describe('updateSessionStats', () => {
    test('updates tokens and cost', () => {
      const session = createSession('stats-test');
      trackSession(session.id);

      updateSessionStats(session.id, 100, 0.05);

      const retrieved = getSession(session.id);
      expect(retrieved?.totalTokens).toBe(100);
      expect(retrieved?.totalCost).toBe(0.05);
    });

    test('accumulates tokens and cost', () => {
      const session = createSession('accumulate-test');
      trackSession(session.id);

      updateSessionStats(session.id, 100, 0.05);
      updateSessionStats(session.id, 200, 0.1);
      updateSessionStats(session.id, 50, 0.02);

      const retrieved = getSession(session.id);
      expect(retrieved?.totalTokens).toBe(350);
      expect(retrieved?.totalCost).toBeCloseTo(0.17, 5);
    });

    test('sets title on first update', () => {
      const session = createSession('title-test');
      trackSession(session.id);

      updateSessionStats(session.id, 100, 0.05, 'My conversation');

      const sessions = listSessions(10);
      const found = sessions.find(s => s.id === session.id);
      expect(found?.title).toBe('My conversation');
    });

    test('does not overwrite existing title', () => {
      const session = createSession('title-preserve-test');
      trackSession(session.id);

      updateSessionStats(session.id, 100, 0.05, 'First title');
      updateSessionStats(session.id, 100, 0.05, 'Second title');

      const sessions = listSessions(10);
      const found = sessions.find(s => s.id === session.id);
      expect(found?.title).toBe('First title');
    });

    test('handles zero values', () => {
      const session = createSession('zero-test');
      trackSession(session.id);

      updateSessionStats(session.id, 0, 0);

      const retrieved = getSession(session.id);
      expect(retrieved?.totalTokens).toBe(0);
      expect(retrieved?.totalCost).toBe(0);
    });

    test('handles very small cost values', () => {
      const session = createSession('small-cost-test');
      trackSession(session.id);

      updateSessionStats(session.id, 10, 0.0001);

      const retrieved = getSession(session.id);
      expect(retrieved?.totalCost).toBeCloseTo(0.0001, 6);
    });
  });

  describe('listSessions', () => {
    test('lists sessions in descending order by update time', async () => {
      const session1 = createSession('list-test-1');
      trackSession(session1.id);
      await new Promise(r => setTimeout(r, 10));

      const session2 = createSession('list-test-2');
      trackSession(session2.id);
      await new Promise(r => setTimeout(r, 10));

      const session3 = createSession('list-test-3');
      trackSession(session3.id);

      const sessions = listSessions(10);

      // Most recent should be first
      const ids = sessions.map(s => s.id);
      const idx1 = ids.indexOf(session1.id);
      const idx2 = ids.indexOf(session2.id);
      const idx3 = ids.indexOf(session3.id);

      expect(idx3).toBeLessThan(idx2);
      expect(idx2).toBeLessThan(idx1);
    });

    test('respects limit parameter', () => {
      // Create a few sessions
      for (let i = 0; i < 5; i++) {
        const session = createSession(`limit-test-${i}`);
        trackSession(session.id);
      }

      const sessions = listSessions(3);
      expect(sessions.length).toBeLessThanOrEqual(3);
    });

    test('includes message count', () => {
      const session = createSession('count-test');
      trackSession(session.id);

      addMessage(session.id, 'user', 'One');
      addMessage(session.id, 'assistant', 'Two');
      addMessage(session.id, 'user', 'Three');

      const sessions = listSessions(10);
      const found = sessions.find(s => s.id === session.id);
      expect(found?.messageCount).toBe(3);
    });

    test('includes cost and model', () => {
      const session = createSession('info-test-model');
      trackSession(session.id);
      updateSessionStats(session.id, 100, 0.05);

      const sessions = listSessions(10);
      const found = sessions.find(s => s.id === session.id);
      expect(found?.model).toBe('info-test-model');
      expect(found?.totalCost).toBe(0.05);
    });

    test('shows null title for untitled sessions', () => {
      const session = createSession('untitled-test');
      trackSession(session.id);

      const sessions = listSessions(10);
      const found = sessions.find(s => s.id === session.id);
      expect(found?.title).toBeNull();
    });
  });

  describe('getLastSession', () => {
    test('returns most recently updated session', async () => {
      const session1 = createSession('last-test-1');
      trackSession(session1.id);
      await new Promise(r => setTimeout(r, 10));

      const session2 = createSession('last-test-2');
      trackSession(session2.id);

      const last = getLastSession();
      expect(last?.id).toBe(session2.id);
    });

    test('updates after adding message to older session', async () => {
      const older = createSession('older-session');
      trackSession(older.id);
      await new Promise(r => setTimeout(r, 10));

      const newer = createSession('newer-session');
      trackSession(newer.id);
      await new Promise(r => setTimeout(r, 10));

      // Adding message to older session updates its timestamp
      addMessage(older.id, 'user', 'New message');

      const last = getLastSession();
      expect(last?.id).toBe(older.id);
    });
  });

  describe('deleteSession', () => {
    test('deletes session and returns true', () => {
      const session = createSession('delete-test');
      // Don't track - we're deleting it

      const deleted = deleteSession(session.id);
      expect(deleted).toBe(true);

      const retrieved = getSession(session.id);
      expect(retrieved).toBeNull();
    });

    test('deletes associated messages (cascade)', () => {
      const session = createSession('cascade-test');

      addMessage(session.id, 'user', 'Message 1');
      addMessage(session.id, 'assistant', 'Message 2');

      deleteSession(session.id);

      // Session and messages should be gone
      const retrieved = getSession(session.id);
      expect(retrieved).toBeNull();
    });

    test('returns false for non-existent session', () => {
      const deleted = deleteSession('nonexistent999');
      expect(deleted).toBe(false);
    });

    test('handles double delete gracefully', () => {
      const session = createSession('double-delete-test');

      expect(deleteSession(session.id)).toBe(true);
      expect(deleteSession(session.id)).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('handles high volume of messages', () => {
      const session = createSession('high-volume');
      trackSession(session.id);

      for (let i = 0; i < 100; i++) {
        addMessage(session.id, i % 2 === 0 ? 'user' : 'assistant', `Message ${i}`, i);
      }

      const retrieved = getSession(session.id);
      expect(retrieved?.messages.length).toBe(100);
    });

    test('handles concurrent session creation', () => {
      const sessions = [];
      for (let i = 0; i < 10; i++) {
        sessions.push(createSession(`concurrent-${i}`));
      }

      const ids = sessions.map(s => s.id);
      for (const s of sessions) {
        trackSession(s.id);
      }

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });
  });
});
