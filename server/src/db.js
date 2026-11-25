const createDatabase = require('@databases/sqlite');
const CryptoJS = require('crypto-js');
const { sql } = require('@databases/sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'playlist-centralizer.db');

/** Returns the AES encryption key from env, with a fallback warning. */
function getEncKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    console.warn('[DB] ENCRYPTION_KEY not set – using insecure fallback. Set it in .env!');
    return 'insecure-fallback-key-please-change';
  }
  return key;
}

function encrypt(text) {
  if (!text) return null;
  return CryptoJS.AES.encrypt(text, getEncKey()).toString();
}

function decrypt(cipher) {
  if (!cipher) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, getEncKey());
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return null;
  }
}

let _db = null;

function getDB() {
  if (!_db) {
    _db = createDatabase(DB_PATH);
  }
  return _db;
}

// ── Initialisation ────────────────────────────────────────────────────────────

async function initDB() {
  const db = getDB();

  await db.query(sql`
    CREATE TABLE IF NOT EXISTS accounts (
      id            TEXT    PRIMARY KEY,
      email         TEXT    UNIQUE NOT NULL,
      name          TEXT,
      picture       TEXT,
      access_token  TEXT,
      refresh_token TEXT,
      token_expiry  INTEGER,
      created_at    INTEGER DEFAULT (strftime('%s','now')),
      updated_at    INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  await db.query(sql`
    CREATE TABLE IF NOT EXISTS sessions (
      sid     TEXT    PRIMARY KEY,
      sess    TEXT    NOT NULL,
      expired INTEGER NOT NULL
    )
  `);
}

// ── Account CRUD ──────────────────────────────────────────────────────────────

/**
 * Upsert an account. Tokens are AES-encrypted before storage.
 */
async function saveAccount(data) {
  const db = getDB();

  const encAccess  = encrypt(data.access_token);
  const encRefresh = encrypt(data.refresh_token);

  await db.query(sql`
    INSERT INTO accounts (id, email, name, picture, access_token, refresh_token, token_expiry, updated_at)
    VALUES (
      ${data.id},
      ${data.email},
      ${data.name   || null},
      ${data.picture || null},
      ${encAccess},
      ${encRefresh},
      ${data.token_expiry || null},
      ${Math.floor(Date.now() / 1000)}
    )
    ON CONFLICT(id) DO UPDATE SET
      email         = excluded.email,
      name          = excluded.name,
      picture       = excluded.picture,
      access_token  = excluded.access_token,
      refresh_token = excluded.refresh_token,
      token_expiry  = excluded.token_expiry,
      updated_at    = excluded.updated_at
  `);
}

/**
 * Retrieve a single account by id, decrypting tokens.
 * Returns null if not found.
 */
async function getAccount(id) {
  const db = getDB();
  const rows = await db.query(sql`SELECT * FROM accounts WHERE id = ${id}`);
  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    access_token:  decrypt(row.access_token),
    refresh_token: decrypt(row.refresh_token),
  };
}

/**
 * Return all accounts without raw token fields.
 */
async function getAllAccounts() {
  const db = getDB();
  return db.query(sql`
    SELECT id, email, name, picture, token_expiry, created_at, updated_at
    FROM accounts
    ORDER BY created_at ASC
  `);
}

/**
 * Delete an account by id. Returns true if a row was removed.
 */
async function deleteAccount(id) {
  const db = getDB();
  // @databases/sqlite doesn't return changes count directly, so check existence first
  const rows = await db.query(sql`SELECT id FROM accounts WHERE id = ${id}`);
  if (!rows.length) return false;
  await db.query(sql`DELETE FROM accounts WHERE id = ${id}`);
  return true;
}

/**
 * Update only the token fields for an existing account.
 */
async function updateTokens(id, accessToken, refreshToken, expiry) {
  const db = getDB();
  await db.query(sql`
    UPDATE accounts
    SET access_token  = ${encrypt(accessToken)},
        refresh_token = ${encrypt(refreshToken)},
        token_expiry  = ${expiry || null},
        updated_at    = ${Math.floor(Date.now() / 1000)}
    WHERE id = ${id}
  `);
}

module.exports = {
  initDB,
  saveAccount,
  getAccount,
  getAllAccounts,
  deleteAccount,
  updateTokens,
};
