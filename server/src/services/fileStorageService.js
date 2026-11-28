const fs = require('fs');
const path = require('path');
const { getDB, sql } = require('../db');

const BASE_DOWNLOADS_DIR = path.join(__dirname, '..', '..', 'downloads');

/**
 * Sanitize a string to be safe for filenames across Windows, macOS, and Linux.
 */
function sanitizeFilename(name) {
  if (!name) return 'track';
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

class FileStorageService {
  constructor() {
    this.ensureBaseDir();
  }

  ensureBaseDir() {
    if (!fs.existsSync(BASE_DOWNLOADS_DIR)) {
      fs.mkdirSync(BASE_DOWNLOADS_DIR, { recursive: true });
    }
  }

  /**
   * Get the directory path for a specific download job.
   */
  getJobDirectory(jobId) {
    const dir = path.join(BASE_DOWNLOADS_DIR, jobId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Formats a clean, numbered file name: e.g. "001 - Queen - Bohemian Rhapsody.flac"
   */
  getStandardFilename(position, artist, title, extension) {
    const num = String(position + 1).padStart(3, '0');
    const safeArtist = sanitizeFilename(artist || 'Unknown Artist');
    const safeTitle = sanitizeFilename(title || 'Track');
    const cleanExt = extension.replace(/^\./, '');
    return `${num} - ${safeArtist} - ${safeTitle}.${cleanExt}`;
  }

  /**
   * Save plain lyrics or LRC string to disk and register in DB.
   */
  async saveTextFile({ jobId, trackId, filename, content, fileType = 'lrc' }) {
    const jobDir = this.getJobDirectory(jobId);
    const filePath = path.join(jobDir, filename);

    await fs.promises.writeFile(filePath, content, 'utf8');
    const stat = await fs.promises.stat(filePath);

    const db = getDB();
    const id = require('crypto').randomUUID();

    await db.query(sql`
      INSERT INTO download_files (id, track_id, file_type, file_path, file_name, file_size, mime_type, created_at)
      VALUES (
        ${id},
        ${trackId},
        ${fileType},
        ${filePath},
        ${filename},
        ${stat.size},
        ${fileType === 'lrc' ? 'text/plain; charset=utf-8' : 'text/plain'},
        ${Math.floor(Date.now() / 1000)}
      )
    `);

    return { filePath, filename, size: stat.size };
  }

  /**
   * Register a downloaded audio file in download_files.
   */
  async registerAudioFile({ trackId, filePath, filename, size, mimeType }) {
    const db = getDB();
    const id = require('crypto').randomUUID();

    await db.query(sql`
      INSERT INTO download_files (id, track_id, file_type, file_path, file_name, file_size, mime_type, created_at)
      VALUES (
        ${id},
        ${trackId},
        'audio',
        ${filePath},
        ${filename},
        ${size},
        ${mimeType || 'audio/octet-stream'},
        ${Math.floor(Date.now() / 1000)}
      )
    `);
  }

  /**
   * Get all registered files for a track.
   */
  async getTrackFiles(trackId) {
    const db = getDB();
    return db.query(sql`
      SELECT * FROM download_files WHERE track_id = ${trackId}
    `);
  }
}

module.exports = new FileStorageService();
