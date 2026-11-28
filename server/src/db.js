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

  // SQLite WAL mode & concurrency pragmas (Phase 7 Hardening)
  await db.query(sql`PRAGMA journal_mode = WAL;`);
  await db.query(sql`PRAGMA busy_timeout = 5000;`);
  await db.query(sql`PRAGMA synchronous = NORMAL;`);

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

  await db.query(sql`
    CREATE TABLE IF NOT EXISTS download_jobs (
      id                 TEXT    PRIMARY KEY,
      playlist_id        TEXT,
      playlist_title     TEXT,
      total_tracks       INTEGER DEFAULT 0,
      completed_tracks   INTEGER DEFAULT 0,
      partial_tracks     INTEGER DEFAULT 0,
      unavailable_tracks INTEGER DEFAULT 0,
      failed_tracks      INTEGER DEFAULT 0,
      status             TEXT    DEFAULT 'PENDING',
      created_at         INTEGER DEFAULT (strftime('%s','now')),
      updated_at         INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  await db.query(sql`
    CREATE TABLE IF NOT EXISTS download_tracks (
      id                TEXT    PRIMARY KEY,
      job_id            TEXT    NOT NULL,
      video_id          TEXT    NOT NULL,
      playlist_position INTEGER NOT NULL,
      title             TEXT    NOT NULL,
      artist            TEXT,
      album             TEXT,
      duration          INTEGER,
      thumbnail         TEXT,
      audio_provider    TEXT,
      source_track_id   TEXT,
      source_url        TEXT,
      source_license    TEXT,
      audio_format      TEXT,
      actual_bitrate    INTEGER,
      sample_rate       INTEGER,
      download_progress INTEGER DEFAULT 0,
      download_status   TEXT    DEFAULT 'PENDING',
      lyrics_status     TEXT    DEFAULT 'PENDING',
      error_message     TEXT,
      retry_count       INTEGER DEFAULT 0,
      local_file_path   TEXT,
      created_at        INTEGER DEFAULT (strftime('%s','now')),
      updated_at        INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  await db.query(sql`
    CREATE TABLE IF NOT EXISTS download_files (
      id          TEXT    PRIMARY KEY,
      track_id    TEXT    NOT NULL,
      file_type   TEXT    NOT NULL,
      file_path   TEXT    NOT NULL,
      file_name   TEXT    NOT NULL,
      file_size   INTEGER DEFAULT 0,
      mime_type   TEXT,
      created_at  INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  await db.query(sql`
    CREATE TABLE IF NOT EXISTS lyrics_metadata (
      id                 TEXT    PRIMARY KEY,
      track_id           TEXT    UNIQUE NOT NULL,
      lrclib_id          INTEGER,
      title              TEXT,
      artist             TEXT,
      album              TEXT,
      duration           REAL,
      instrumental       INTEGER DEFAULT 0,
      plain_lyrics       TEXT,
      synced_lyrics      TEXT,
      match_confidence   REAL    DEFAULT 0.0,
      needs_confirmation INTEGER DEFAULT 0,
      confirmed_by_user  INTEGER DEFAULT 0,
      created_at         INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_download_tracks_job_id ON download_tracks(job_id)
  `);

  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_download_tracks_status ON download_tracks(download_status)
  `);

  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_download_files_track_id ON download_files(track_id)
  `);

  // Safe Phase 2 column migrations for download_tracks
  const newCols = [
    sql`ALTER TABLE download_tracks ADD COLUMN license_url TEXT`,
    sql`ALTER TABLE download_tracks ADD COLUMN attribution TEXT`,
    sql`ALTER TABLE download_tracks ADD COLUMN match_outcome TEXT`,
    sql`ALTER TABLE download_tracks ADD COLUMN match_score REAL`,
  ];
  for (const colSql of newCols) {
    try {
      await db.query(colSql);
    } catch {
      // Column already exists, ignore
    }
  }

  // ── Phase 3: Coverage Scanner Tables ──────────────────────────────────────

  await db.query(sql`
    CREATE TABLE IF NOT EXISTS coverage_scans (
      id               TEXT    PRIMARY KEY,
      playlist_id      TEXT,
      playlist_title   TEXT,
      total_tracks     INTEGER DEFAULT 0,
      scanned_tracks   INTEGER DEFAULT 0,
      status           TEXT    DEFAULT 'PENDING',
      started_at       INTEGER,
      completed_at     INTEGER,
      error_message    TEXT,
      created_at       INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  await db.query(sql`
    CREATE TABLE IF NOT EXISTS audio_candidates (
      id                TEXT    PRIMARY KEY,
      scan_id           TEXT    NOT NULL,
      video_id          TEXT    NOT NULL,
      title             TEXT,
      artist            TEXT,
      provider          TEXT    NOT NULL,
      provider_track_id TEXT,
      candidate_title   TEXT,
      candidate_artist  TEXT,
      candidate_album   TEXT,
      candidate_duration INTEGER,
      source_url        TEXT,
      download_url      TEXT,
      license_name      TEXT,
      license_url       TEXT,
      attribution       TEXT,
      download_allowed  INTEGER DEFAULT 0,
      format            TEXT,
      bitrate           INTEGER,
      quality_tier      TEXT,
      match_outcome     TEXT,
      match_score       REAL    DEFAULT 0.0,
      match_reasons     TEXT,
      version_discrepancies TEXT,
      is_best           INTEGER DEFAULT 0,
      user_confirmed    INTEGER DEFAULT 0,
      checked_at        INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(scan_id, video_id, provider, provider_track_id)
    )
  `);

  await db.query(sql`
    CREATE TABLE IF NOT EXISTS lyrics_candidates (
      id                TEXT    PRIMARY KEY,
      scan_id           TEXT    NOT NULL,
      video_id          TEXT    NOT NULL,
      title             TEXT,
      artist            TEXT,
      lrclib_id         INTEGER,
      matched_title     TEXT,
      matched_artist    TEXT,
      matched_album     TEXT,
      matched_duration  REAL,
      has_synced        INTEGER DEFAULT 0,
      has_plain         INTEGER DEFAULT 0,
      is_instrumental   INTEGER DEFAULT 0,
      match_confidence  REAL    DEFAULT 0.0,
      status            TEXT    DEFAULT 'PENDING',
      error_message     TEXT,
      checked_at        INTEGER DEFAULT (strftime('%s','now')),
      UNIQUE(scan_id, video_id)
    )
  `);

  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_audio_candidates_scan_id ON audio_candidates(scan_id)
  `);
  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_audio_candidates_video_id ON audio_candidates(video_id)
  `);
  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_lyrics_candidates_scan_id ON lyrics_candidates(scan_id)
  `);
  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_lyrics_candidates_video_id ON lyrics_candidates(video_id)
  `);
  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_coverage_scans_playlist ON coverage_scans(playlist_id)
  `);

  // ── Phase 3.1: Data Integrity & Audit Migrations ─────────────────────────
  const phase31Cols = [
    // audio_candidates enhancements
    sql`ALTER TABLE audio_candidates ADD COLUMN track_id TEXT`,
    sql`ALTER TABLE audio_candidates ADD COLUMN playlist_position INTEGER`,
    sql`ALTER TABLE audio_candidates ADD COLUMN original_title TEXT`,
    sql`ALTER TABLE audio_candidates ADD COLUMN original_artist TEXT`,
    sql`ALTER TABLE audio_candidates ADD COLUMN rights_status TEXT`,
    sql`ALTER TABLE audio_candidates ADD COLUMN rights_justification TEXT`,
    sql`ALTER TABLE audio_candidates ADD COLUMN version_type TEXT`,

    // lyrics_candidates enhancements
    sql`ALTER TABLE lyrics_candidates ADD COLUMN track_id TEXT`,
    sql`ALTER TABLE lyrics_candidates ADD COLUMN playlist_position INTEGER`,
    sql`ALTER TABLE lyrics_candidates ADD COLUMN original_title TEXT`,
    sql`ALTER TABLE lyrics_candidates ADD COLUMN original_artist TEXT`,
    sql`ALTER TABLE lyrics_candidates ADD COLUMN timestamps_present INTEGER DEFAULT 0`,
    sql`ALTER TABLE lyrics_candidates ADD COLUMN verification_notes TEXT`,
  ];

  for (const colSql of phase31Cols) {
    try {
      await db.query(colSql);
    } catch {
      // Column already exists, safe to ignore
    }
  }

  // Audit results table
  await db.query(sql`
    CREATE TABLE IF NOT EXISTS integrity_audits (
      id                          TEXT    PRIMARY KEY,
      scan_id                     TEXT    NOT NULL,
      playlist_id                 TEXT,
      total_audited               INTEGER DEFAULT 0,
      correct_associations        INTEGER DEFAULT 0,
      mismatches_detected         INTEGER DEFAULT 0,
      candidates_requiring_review INTEGER DEFAULT 0,
      candidates_rejected_rights  INTEGER DEFAULT 0,
      lyrics_verified             INTEGER DEFAULT 0,
      lyrics_needs_review         INTEGER DEFAULT 0,
      audit_data                  TEXT,
      created_at                  INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_integrity_audits_scan_id ON integrity_audits(scan_id)
  `);

  // ── Phase 4: Snapshot Integrity & Metadata Tagging Migrations ─────────────
  await db.query(sql`
    CREATE TABLE IF NOT EXISTS playlist_snapshots (
      id            TEXT    PRIMARY KEY,
      playlist_id   TEXT    NOT NULL,
      version_label TEXT    NOT NULL,
      track_count   INTEGER NOT NULL,
      manifest_json TEXT    NOT NULL,
      created_at    INTEGER DEFAULT (strftime('%s','now'))
    )
  `);

  await db.query(sql`
    CREATE INDEX IF NOT EXISTS idx_playlist_snapshots_playlist ON playlist_snapshots(playlist_id)
  `);

  const phase4Cols = [
    sql`ALTER TABLE download_tracks ADD COLUMN album_artist TEXT`,
    sql`ALTER TABLE download_tracks ADD COLUMN track_number INTEGER`,
    sql`ALTER TABLE download_tracks ADD COLUMN playlist_track_number INTEGER`,
    sql`ALTER TABLE download_tracks ADD COLUMN album_track_number INTEGER`,
    sql`ALTER TABLE download_tracks ADD COLUMN rights_status TEXT`,
    sql`ALTER TABLE download_tracks ADD COLUMN release_year INTEGER`,
    sql`ALTER TABLE download_tracks ADD COLUMN genre TEXT`,
    sql`ALTER TABLE download_tracks ADD COLUMN has_embedded_artwork INTEGER DEFAULT 0`,
    sql`ALTER TABLE download_tracks ADD COLUMN artwork_path TEXT`,
    sql`ALTER TABLE download_tracks ADD COLUMN snapshot_id TEXT`,
  ];

  for (const colSql of phase4Cols) {
    try {
      await db.query(colSql);
    } catch {
      // Column already exists, safe to ignore
    }
  }
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
  getDB,
  sql,
  initDB,
  saveAccount,
  getAccount,
  getAllAccounts,
  deleteAccount,
  updateTokens,
};
