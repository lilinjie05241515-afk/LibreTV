import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

let current: Database.Database | null = null;
let currentPath = '';

export function accountDb(): Database.Database {
  const filename = process.env.LIBRETV_DB_PATH || path.join(process.cwd(), 'data', 'accounts.sqlite');
  if (current && currentPath === filename) return current;
  current?.close();
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new Database(filename);
  if (process.platform !== 'win32') fs.chmodSync(filename, 0o600);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','user')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
      created_at INTEGER NOT NULL,
      password_changed_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      used_by TEXT REFERENCES users(id),
      used_at INTEGER,
      revoked_at INTEGER,
      note TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      created_by TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT REFERENCES users(id),
      action TEXT NOT NULL,
      target_id TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  current = db;
  currentPath = filename;
  return db;
}

/** Test helper: closes the current handle so an isolated temporary DB can be removed. */
export function closeAccountDb(): void {
  current?.close();
  current = null;
  currentPath = '';
}
