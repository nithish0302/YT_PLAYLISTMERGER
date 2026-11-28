const snapshotService = require('../services/snapshotService');
const audioTaggingService = require('../services/audioTaggingService');
const artworkService = require('../services/artworkService');
const zipExportService = require('../services/zipExportService');
const backupService = require('../services/backupService');

class LibraryController {
  /**
   * GET /api/library/snapshots
   */
  async listSnapshots(req, res, next) {
    try {
      const { playlistId } = req.query;
      const list = await snapshotService.listSnapshots(playlistId || null);
      res.json({ snapshots: list });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/library/snapshots/:id
   */
  async getSnapshot(req, res, next) {
    try {
      const { id } = req.params;
      const snap = await snapshotService.getSnapshot(id);
      if (!snap) return res.status(404).json({ error: 'Snapshot not found' });
      res.json(snap);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/library/tag
   * Tag audio file on disk with metadata & artwork.
   */
  async tagAudio(req, res, next) {
    try {
      const { filePath, tags, artworkBase64, mimeType } = req.body;
      if (!filePath) return res.status(400).json({ error: 'filePath is required' });

      let artworkBuffer = null;
      if (artworkBase64) {
        artworkBuffer = Buffer.from(artworkBase64, 'base64');
      }

      try {
        const updatedMetadata = await audioTaggingService.tagAudioFile(
          filePath,
          tags || {},
          artworkBuffer,
          mimeType || 'image/jpeg'
        );
        res.json({ success: true, metadata: updatedMetadata });
      } catch (tagErr) {
        if (tagErr.message.includes('not found')) {
          return res.status(404).json({ error: tagErr.message });
        }
        if (tagErr.message.includes('Unsupported audio format') || tagErr.message.includes('Prohibited operation')) {
          return res.status(400).json({ error: tagErr.message });
        }
        throw tagErr;
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/library/artwork/validate
   * Validate artwork base64 or buffer.
   */
  async validateArtwork(req, res, next) {
    try {
      const { artworkBase64, url } = req.body;
      if (url) {
        const fetched = await artworkService.fetchPermittedArtwork(url);
        if (!fetched) {
          return res.status(400).json({ valid: false, error: 'Artwork URL rejected or invalid' });
        }
        return res.json({ valid: true, mimeType: fetched.mimeType, width: fetched.width, height: fetched.height });
      }

      if (!artworkBase64) {
        return res.status(400).json({ valid: false, error: 'artworkBase64 or url is required' });
      }

      const buffer = Buffer.from(artworkBase64, 'base64');
      const validation = artworkService.validateImageBuffer(buffer);
      if (!validation.valid) {
        return res.status(400).json(validation);
      }
      res.json(validation);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/library/jobs/:jobId/export
   */
  async exportLibrary(req, res, next) {
    try {
      const { jobId } = req.params;
      if (!jobId) {
        return res.status(400).json({ error: 'jobId is required' });
      }
      await zipExportService.streamJobZip(jobId, res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/library/backup
   */
  async createBackup(req, res, next) {
    try {
      const result = await backupService.createBackup(req.body || {});
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/library/backups
   */
  async listBackups(req, res, next) {
    try {
      const backups = backupService.listBackups();
      res.json({ backups });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/library/restore
   */
  async restoreBackup(req, res, next) {
    try {
      const { backupPath, destinationDbPath } = req.body;
      if (!backupPath || !destinationDbPath) {
        return res.status(400).json({ error: 'backupPath and destinationDbPath are required.' });
      }
      const result = await backupService.restoreBackup(backupPath, destinationDbPath);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new LibraryController();
