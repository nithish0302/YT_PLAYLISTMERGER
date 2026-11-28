const path = require('path');
const fs = require('fs');
const createDatabase = require('@databases/sqlite');
const { getDB, sql } = require('../db');

class BackupService {
  constructor() {
    this.defaultBackupDir = path.join(__dirname, '..', '..', 'backups');
  }

  /**
   * Get configured backup directory.
   */
  getBackupDir(customDir = null) {
    const dir = customDir || process.env.BACKUP_DIR || this.defaultBackupDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Generate timestamped backup filename: backup_YYYYMMDD_HHMMSS.sqlite
   */
  generateBackupFilename() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    return `backup_${yyyy}${mm}${dd}_${hh}${min}${ss}.sqlite`;
  }

  /**
   * Create an online, transactionally consistent backup using VACUUM INTO.
   * Includes all committed transactions even with WAL mode active.
   * Validates backup integrity with PRAGMA integrity_check.
   */
  async createBackup(options = {}) {
    const db = getDB();
    const backupDir = this.getBackupDir(options.backupDir);
    const filename = options.filename || this.generateBackupFilename();
    const targetPath = path.join(backupDir, filename).replace(/\\/g, '/');

    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    // SQLite 3.27+ VACUUM INTO creates a live point-in-time consolidated snapshot
    await db.query(sql`VACUUM INTO ${targetPath}`);

    if (!fs.existsSync(targetPath)) {
      throw new Error(`Backup file was not created at: ${targetPath}`);
    }

    const fileSize = fs.statSync(targetPath).size;
    if (fileSize === 0) {
      fs.unlinkSync(targetPath);
      throw new Error('Backup failed: Generated backup file is empty (0 bytes).');
    }

    // Validate backup integrity
    await this.verifyBackupIntegrity(targetPath);

    return {
      success: true,
      backupPath: targetPath,
      fileName: filename,
      fileSize,
      timestamp: new Date().toISOString(),
      integrity: 'ok',
    };
  }

  /**
   * Validate SQLite database file integrity via PRAGMA integrity_check.
   */
  async verifyBackupIntegrity(dbFilePath) {
    if (!fs.existsSync(dbFilePath)) {
      throw new Error(`Backup file does not exist: ${dbFilePath}`);
    }

    const tempDb = createDatabase(dbFilePath);
    try {
      const rows = await tempDb.query(sql`PRAGMA integrity_check;`);
      const result = rows && rows[0] ? (rows[0].integrity_check || rows[0]['integrity_check']) : null;
      if (result !== 'ok') {
        throw new Error(`Integrity check failed: ${result}`);
      }
      return true;
    } finally {
      await tempDb.dispose();
    }
  }

  /**
   * List all valid backups sorted by creation date descending.
   */
  listBackups(customDir = null) {
    const backupDir = this.getBackupDir(customDir);
    const files = fs.readdirSync(backupDir);

    const backups = [];
    for (const file of files) {
      if (file.endsWith('.sqlite') || file.endsWith('.db')) {
        const fullPath = path.join(backupDir, file);
        try {
          const stats = fs.statSync(fullPath);
          backups.push({
            fileName: file,
            fullPath,
            size: stats.size,
            createdAt: stats.birthtime || stats.mtime,
          });
        } catch (_) {}
      }
    }

    backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return backups;
  }

  /**
   * Restore a backup file into a specified destination database.
   * Performs pre-restore integrity validation.
   */
  async restoreBackup(backupFilePath, destinationDbPath) {
    if (!fs.existsSync(backupFilePath)) {
      throw new Error(`Source backup file not found: ${backupFilePath}`);
    }

    // 1. Verify source backup integrity before attempting restoration
    await this.verifyBackupIntegrity(backupFilePath);

    // 2. Ensure destination directory exists
    const destDir = path.dirname(destinationDbPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // 3. Atomically copy the validated backup to destination
    fs.copyFileSync(backupFilePath, destinationDbPath);

    // 4. Verify restored database opens and passes integrity check
    await this.verifyBackupIntegrity(destinationDbPath);

    return {
      success: true,
      restoredFrom: backupFilePath,
      destination: destinationDbPath,
      fileSize: fs.statSync(destinationDbPath).size,
      restoredAt: new Date().toISOString(),
      integrity: 'ok',
    };
  }
}

module.exports = new BackupService();
