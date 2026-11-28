const fs = require('fs');
const path = require('path');
const { getDB, sql } = require('../db');

class SnapshotService {
  constructor() {
    this.snapshotsDir = path.join(__dirname, '..', '..', 'snapshots');
    if (!fs.existsSync(this.snapshotsDir)) {
      fs.mkdirSync(this.snapshotsDir, { recursive: true });
    }
  }

  /**
   * Initialize and seed baseline snapshots (v1: 176 tracks, v2: 181 tracks).
   */
  async initBaselineSnapshots() {
    const rawPath = path.join(__dirname, '..', '..', 'import_snapshot.json');
    if (!fs.existsSync(rawPath)) return;

    const rawData = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
    const all181 = Array.isArray(rawData) ? rawData : (rawData.tracks || []);

    if (all181.length >= 176) {
      // 1. Snapshot 176 (original base)
      const tracks176 = all181.slice(0, 176);
      const snap176Path = path.join(this.snapshotsDir, 'import_snapshot_176.json');
      const snap176Data = {
        snapshotId: 'snapshot_PLMeZARHzcGt0_v1_176',
        playlistId: 'PLMeZARHzcGt0',
        versionLabel: 'v1.0 (Baseline 176 tracks)',
        trackCount: 176,
        createdAt: '2026-11-28T07:15:00.000Z',
        tracks: tracks176,
      };
      if (!fs.existsSync(snap176Path)) {
        fs.writeFileSync(snap176Path, JSON.stringify(snap176Data, null, 2));
      }
      await this.registerSnapshotInDB(snap176Data);

      // 2. Snapshot 181 (refreshed live count)
      const snap181Path = path.join(this.snapshotsDir, 'import_snapshot_181.json');
      const snap181Data = {
        snapshotId: 'snapshot_PLMeZARHzcGt0_v2_181',
        playlistId: 'PLMeZARHzcGt0',
        versionLabel: 'v2.0 (Refreshed 181 tracks)',
        trackCount: all181.length,
        createdAt: '2026-11-28T07:15:04.026Z',
        tracks: all181,
      };
      if (!fs.existsSync(snap181Path)) {
        fs.writeFileSync(snap181Path, JSON.stringify(snap181Data, null, 2));
      }
      await this.registerSnapshotInDB(snap181Data);

      console.log(`[SnapshotService] Verified baseline snapshots: v1 (176 tracks) and v2 (${all181.length} tracks).`);
    }
  }

  /**
   * Save and register a new immutable playlist snapshot.
   */
  async saveSnapshot({ playlistId, versionLabel, tracks, metadata = {} }) {
    const db = getDB();
    const count = tracks.length;
    const now = Math.floor(Date.now() / 1000);
    const snapshotId = `snapshot_${playlistId}_${count}_${now}`;

    const snapshotData = {
      snapshotId,
      playlistId,
      versionLabel: versionLabel || `Snapshot (${count} tracks)`,
      trackCount: count,
      createdAt: new Date(now * 1000).toISOString(),
      metadata,
      tracks,
    };

    const filePath = path.join(this.snapshotsDir, `snapshot_${playlistId}_${count}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshotData, null, 2));

    await this.registerSnapshotInDB(snapshotData);
    return snapshotData;
  }

  /**
   * Upsert snapshot in SQLite.
   */
  async registerSnapshotInDB(snapData) {
    const db = getDB();
    try {
      const existing = await db.query(sql`SELECT id FROM playlist_snapshots WHERE id = ${snapData.snapshotId}`);
      if (existing.length === 0) {
        await db.query(sql`
          INSERT INTO playlist_snapshots (id, playlist_id, version_label, track_count, manifest_json, created_at)
          VALUES (
            ${snapData.snapshotId}, ${snapData.playlistId}, ${snapData.versionLabel},
            ${snapData.trackCount}, ${JSON.stringify(snapData)},
            ${Math.floor(new Date(snapData.createdAt).getTime() / 1000)}
          )
        `);
      }
    } catch (err) {
      console.warn('[SnapshotService] DB registration error:', err.message);
    }
  }

  /**
   * Retrieve snapshot by ID.
   */
  async getSnapshot(snapshotId) {
    const db = getDB();
    const idWithPrefix = snapshotId.startsWith('snapshot_') ? snapshotId : `snapshot_${snapshotId}`;
    const rows = await db.query(sql`
      SELECT * FROM playlist_snapshots 
      WHERE id = ${snapshotId} OR id = ${idWithPrefix}
    `);
    if (rows.length > 0) {
      try {
        const obj = JSON.parse(rows[0].manifest_json);
        obj.id = rows[0].id;
        obj.snapshotId = rows[0].id;
        return obj;
      } catch (_) {}
    }

    // Fallback to disk
    const files = fs.readdirSync(this.snapshotsDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(this.snapshotsDir, file), 'utf8'));
          if (data.snapshotId === snapshotId || data.snapshotId === idWithPrefix) return data;
        } catch (_) {}
      }
    }
    return null;
  }

  /**
   * List all registered snapshots for a playlist.
   */
  async listSnapshots(playlistId = null) {
    const db = getDB();
    let query = sql`SELECT id, playlist_id, version_label, track_count, created_at FROM playlist_snapshots ORDER BY created_at ASC`;
    if (playlistId) {
      query = sql`SELECT id, playlist_id, version_label, track_count, created_at FROM playlist_snapshots WHERE playlist_id = ${playlistId} ORDER BY created_at ASC`;
    }
    const rows = await db.query(query);
    return rows.map(r => ({
      id: r.id,
      snapshotId: r.id,
      playlistId: r.playlist_id,
      versionLabel: r.version_label,
      trackCount: r.track_count,
      createdAt: new Date(r.created_at * 1000).toISOString(),
    }));
  }
}

module.exports = new SnapshotService();
