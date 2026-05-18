'use strict';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

class SessionStore {
  constructor(db, { ttlMs = TTL_MS } = {}) {
    this._db = db;
    this._ttlMs = ttlMs;
    this._cache = new Map();

    this._db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        from_id TEXT PRIMARY KEY,
        step TEXT NOT NULL,
        data TEXT NOT NULL DEFAULT '{}',
        updated_at INTEGER NOT NULL
      );
    `);
  }

  has(from) {
    return this._getValid(from) !== null;
  }

  get(from) {
    return this._getValid(from);
  }

  set(from, { step, data }) {
    const record = { step, data, updatedAt: Date.now() };
    this._cache.set(from, record);
    this._db
      .prepare(
        `INSERT INTO sessions (from_id, step, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(from_id) DO UPDATE SET step = excluded.step, data = excluded.data, updated_at = excluded.updated_at`
      )
      .run(from, step, JSON.stringify(data), record.updatedAt);
  }

  delete(from) {
    this._cache.delete(from);
    this._db.prepare('DELETE FROM sessions WHERE from_id = ?').run(from);
  }

  evictStale() {
    const cutoff = Date.now() - this._ttlMs;
    for (const [key, val] of this._cache) {
      if (val.updatedAt < cutoff) this._cache.delete(key);
    }
    this._db.prepare('DELETE FROM sessions WHERE updated_at < ?').run(cutoff);
  }

  _getValid(from) {
    if (this._cache.has(from)) {
      const session = this._cache.get(from);
      if (Date.now() - session.updatedAt < this._ttlMs) return session;
      this.delete(from);
      return null;
    }

    const row = this._db.prepare('SELECT * FROM sessions WHERE from_id = ?').get(from);
    if (!row) return null;

    if (Date.now() - row.updated_at > this._ttlMs) {
      this.delete(from);
      return null;
    }

    const session = { step: row.step, data: JSON.parse(row.data), updatedAt: row.updated_at };
    this._cache.set(from, session);
    return session;
  }
}

module.exports = { SessionStore };
