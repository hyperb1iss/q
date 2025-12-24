/**
 * SQLite Session Storage
 *
 * Persists conversation sessions for resume functionality.
 * Uses Bun's built-in SQLite for zero-dependency storage.
 */

import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Message, Session } from '../types.js';

/** Database singleton */
let db: Database | null = null;

/**
 * Get the data directory for q
 */
function getDataDir(): string {
  const home = homedir();

  // Use XDG_DATA_HOME on Linux, ~/Library/Application Support on macOS
  if (process.platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'q');
  }
  const xdgData = process.env.XDG_DATA_HOME ?? join(home, '.local', 'share');
  return join(xdgData, 'q');
}

/**
 * Initialize the database connection
 */
function getDb(): Database {
  if (db) return db;

  const dataDir = getDataDir();

  // Ensure directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = join(dataDir, 'sessions.db');
  db = new Database(dbPath);

  // Enable WAL mode for better concurrent access
  db.run('PRAGMA journal_mode = WAL');

  // Create tables if they don't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      sdk_session_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      model TEXT NOT NULL,
      total_tokens INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0,
      cwd TEXT,
      title TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tokens INTEGER,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  // Index for faster session lookups
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)');
  db.run('CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC)');

  return db;
}

/**
 * Generate a short session ID
 */
function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Create a new session
 */
export function createSession(model: string, cwd?: string): Session {
  const database = getDb();
  const now = Date.now();
  const id = generateId();

  database.run(
    'INSERT INTO sessions (id, created_at, updated_at, model, cwd) VALUES (?, ?, ?, ?, ?)',
    [id, now, now, model, cwd ?? null]
  );

  return {
    id,
    createdAt: now,
    updatedAt: now,
    model,
    messages: [],
    totalTokens: 0,
    totalCost: 0,
  };
}

/**
 * Add a message to a session
 */
export function addMessage(
  sessionId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  tokens?: number
): Message {
  const database = getDb();
  const now = Date.now();
  const id = generateId();

  database.run(
    'INSERT INTO messages (id, session_id, role, content, tokens, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [id, sessionId, role, content, tokens ?? null, now]
  );

  // Update session timestamp
  database.run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId]);

  const msg: Message = {
    id,
    role,
    content,
    timestamp: now,
  };
  if (tokens !== undefined) {
    msg.tokens = tokens;
  }
  return msg;
}

/**
 * Update session stats (tokens, cost)
 */
export function updateSessionStats(
  sessionId: string,
  tokens: number,
  cost: number,
  title?: string
): void {
  const database = getDb();
  const now = Date.now();

  if (title) {
    database.run(
      'UPDATE sessions SET total_tokens = total_tokens + ?, total_cost = total_cost + ?, updated_at = ?, title = COALESCE(title, ?) WHERE id = ?',
      [tokens, cost, now, title, sessionId]
    );
  } else {
    database.run(
      'UPDATE sessions SET total_tokens = total_tokens + ?, total_cost = total_cost + ?, updated_at = ? WHERE id = ?',
      [tokens, cost, now, sessionId]
    );
  }
}

/**
 * Update the SDK session ID for a session
 */
export function updateSdkSessionId(sessionId: string, sdkSessionId: string): void {
  const database = getDb();
  database.run('UPDATE sessions SET sdk_session_id = ? WHERE id = ?', [sdkSessionId, sessionId]);
}

/**
 * Get a session by ID
 */
export function getSession(id: string): Session | null {
  const database = getDb();

  const row = database
    .query<
      {
        id: string;
        sdk_session_id: string | null;
        created_at: number;
        updated_at: number;
        model: string;
        total_tokens: number;
        total_cost: number;
      },
      [string]
    >('SELECT * FROM sessions WHERE id = ?')
    .get(id);

  if (!row) return null;

  const messages = database
    .query<
      {
        id: string;
        role: string;
        content: string;
        tokens: number | null;
        timestamp: number;
      },
      [string]
    >(
      'SELECT id, role, content, tokens, timestamp FROM messages WHERE session_id = ? ORDER BY timestamp ASC'
    )
    .all(id);

  const session: Session = {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    model: row.model,
    totalTokens: row.total_tokens,
    totalCost: row.total_cost,
    messages: messages.map(m => {
      const msg: Message = {
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        timestamp: m.timestamp,
      };
      if (m.tokens !== null) {
        msg.tokens = m.tokens;
      }
      return msg;
    }),
  };
  if (row.sdk_session_id) {
    session.sdkSessionId = row.sdk_session_id;
  }
  return session;
}

/**
 * Get the most recent session
 */
export function getLastSession(): Session | null {
  const database = getDb();

  const row = database
    .query<{ id: string }, []>('SELECT id FROM sessions ORDER BY updated_at DESC LIMIT 1')
    .get();

  if (!row) return null;

  return getSession(row.id);
}

/**
 * List recent sessions
 */
export function listSessions(limit = 10): Array<{
  id: string;
  title: string | null;
  model: string;
  messageCount: number;
  updatedAt: number;
  totalCost: number;
}> {
  const database = getDb();

  return database
    .query<
      {
        id: string;
        title: string | null;
        model: string;
        message_count: number;
        updated_at: number;
        total_cost: number;
      },
      [number]
    >(
      `SELECT
        s.id,
        s.title,
        s.model,
        COUNT(m.id) as message_count,
        s.updated_at,
        s.total_cost
      FROM sessions s
      LEFT JOIN messages m ON s.id = m.session_id
      GROUP BY s.id
      ORDER BY s.updated_at DESC
      LIMIT ?`
    )
    .all(limit)
    .map(row => ({
      id: row.id,
      title: row.title,
      model: row.model,
      messageCount: row.message_count,
      updatedAt: row.updated_at,
      totalCost: row.total_cost,
    }));
}

/**
 * Delete a session
 */
export function deleteSession(id: string): boolean {
  const database = getDb();

  // Messages are deleted via CASCADE
  const result = database.run('DELETE FROM sessions WHERE id = ?', [id]);
  return result.changes > 0;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
