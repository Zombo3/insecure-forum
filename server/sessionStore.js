// sessionStore.js
const session = require("express-session");

class SQLiteSessionStore extends session.Store {
  /**
   * @param {object} opts
   * @param {import("sqlite3").Database} opts.db - sqlite3 db instance
   * @param {string} [opts.tableName="sessions"]
   * @param {number} [opts.cleanupIntervalMs=300000] - 5 min
   */
  constructor({ db, tableName = "sessions", cleanupIntervalMs = 5 * 60 * 1000 } = {}) {
    super();
    if (!db) throw new Error("SQLiteSessionStore requires { db }");

    this.db = db;
    this.tableName = tableName;

    // Ensure table exists
    this._init();

    // Periodic cleanup of expired sessions
    this._cleanupTimer = setInterval(() => this._cleanupExpired(), cleanupIntervalMs);
    this._cleanupTimer.unref?.(); // don’t keep process alive
  }

  _init() {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expires INTEGER
      );
    `;
    this.db.run(sql);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expires ON ${this.tableName}(expires);`);
  }

  _nowMs() {
    return Date.now();
  }

  _getExpiresMs(sess) {
    // express-session stores cookie.expires or cookie.maxAge
    if (sess?.cookie?.expires) return new Date(sess.cookie.expires).getTime();
    if (typeof sess?.cookie?.maxAge === "number") return this._nowMs() + sess.cookie.maxAge;
    // Default: 1 day
    return this._nowMs() + 24 * 60 * 60 * 1000;
  }

  _cleanupExpired() {
    const now = this._nowMs();
    this.db.run(
      `DELETE FROM ${this.tableName} WHERE expires IS NOT NULL AND expires < ?`,
      [now],
      () => {}
    );
  }

  get(sid, cb) {
    this.db.get(
      `SELECT sess FROM ${this.tableName} WHERE sid = ? LIMIT 1`,
      [sid],
      (err, row) => {
        if (err) return cb?.(err);
        if (!row) return cb?.(null, null);

        try {
          const sess = JSON.parse(row.sess);
          return cb?.(null, sess);
        } catch (e) {
          return cb?.(e);
        }
      }
    );
  }

  set(sid, sess, cb) {
    let sessStr;
    let expires;
    try {
      sessStr = JSON.stringify(sess);
      expires = this._getExpiresMs(sess);
    } catch (e) {
      return cb?.(e);
    }

    this.db.run(
      `INSERT INTO ${this.tableName} (sid, sess, expires)
       VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expires=excluded.expires`,
      [sid, sessStr, expires],
      (err) => cb?.(err)
    );
  }

  destroy(sid, cb) {
    this.db.run(`DELETE FROM ${this.tableName} WHERE sid = ?`, [sid], (err) => cb?.(err));
  }

  touch(sid, sess, cb) {
    // Called when session is active; update expiration without rewriting full session if you want.
    // We’ll also update sess blob to be safe (common in custom stores).
    return this.set(sid, sess, cb);
  }

  length(cb) {
    this.db.get(`SELECT COUNT(*) AS count FROM ${this.tableName}`, [], (err, row) => {
      if (err) return cb?.(err);
      cb?.(null, row?.count ?? 0);
    });
  }

  clear(cb) {
    this.db.run(`DELETE FROM ${this.tableName}`, [], (err) => cb?.(err));
  }

  close() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
  }
}

module.exports = { SQLiteSessionStore };
