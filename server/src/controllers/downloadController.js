const downloadService = require('../services/downloadService');
const downloadQueueManager = require('../services/downloadQueueManager');
const lyricsService = require('../services/lyricsService');
const zipExportService = require('../services/zipExportService');
const { getDB, sql } = require('../db');

class DownloadController {
  /**
   * POST /api/downloads/jobs
   * Create a new download job from playlist tracks.
   */
  async createJob(req, res, next) {
    try {
      const { playlistId, playlistTitle, tracks, snapshotId } = req.body;
      if ((!tracks || !Array.isArray(tracks) || tracks.length === 0) && !snapshotId) {
        return res.status(400).json({ error: 'Tracks array or snapshotId is required.' });
      }

      const job = await downloadService.createJobFromPlaylist({
        playlistId,
        playlistTitle,
        tracks,
        snapshotId,
      });

      res.status(201).json(job);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/downloads/jobs
   * List download jobs.
   */
  async listJobs(req, res, next) {
    try {
      const db = getDB();
      const jobs = await db.query(sql`
        SELECT * FROM download_jobs ORDER BY created_at DESC LIMIT 20
      `);
      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/downloads/jobs/:jobId
   */
  async getJob(req, res, next) {
    try {
      const { jobId } = req.params;
      const job = await downloadService.getJob(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json(job);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/downloads/jobs/:jobId/tracks
   */
  async getJobTracks(req, res, next) {
    try {
      const { jobId } = req.params;
      const { status } = req.query;
      const tracks = await downloadService.getJobTracks(jobId, { status });
      res.json({ tracks, total: tracks.length });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/downloads/jobs/:jobId/progress
   */
  async getJobProgress(req, res, next) {
    try {
      const { jobId } = req.params;
      const progress = await downloadService.getJobProgress(jobId);
      if (!progress) return res.status(404).json({ error: 'Job not found' });
      res.json(progress);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/jobs/:jobId/start
   */
  async startQueue(req, res, next) {
    try {
      const { jobId } = req.params;
      const job = await downloadService.getJob(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found.' });

      await downloadQueueManager.startQueue(jobId);
      res.json({ success: true, message: 'Download queue started.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/jobs/:jobId/pause
   */
  async pauseQueue(req, res, next) {
    try {
      const { jobId } = req.params;
      const job = await downloadService.getJob(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found.' });

      await downloadQueueManager.pauseQueue(jobId);
      res.json({ success: true, message: 'Download queue paused.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/jobs/:jobId/cancel
   */
  async cancelQueue(req, res, next) {
    try {
      const { jobId } = req.params;
      const job = await downloadService.getJob(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found.' });

      await downloadQueueManager.cancelQueue(jobId);
      res.json({ success: true, message: 'Download queue cancelled.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/downloads/jobs/:jobId/stats
   * Or GET /api/downloads/stats
   */
  async getDashboardStats(req, res, next) {
    try {
      const { jobId } = req.params;
      if (jobId) {
        const job = await downloadService.getJob(jobId);
        if (!job) return res.status(404).json({ error: 'Job not found.' });
      }
      const stats = await downloadService.getDashboardStats(jobId || null);
      if (!stats) return res.status(404).json({ error: 'Stats not found.' });
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/jobs/:jobId/resume
   */
  async resumeQueue(req, res, next) {
    try {
      const { jobId } = req.params;
      const job = await downloadService.getJob(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found.' });

      await downloadQueueManager.resumeQueue(jobId);
      res.json({ success: true, message: 'Download queue resumed.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/jobs/:jobId/retry-failed
   */
  async retryFailed(req, res, next) {
    try {
      const { jobId } = req.params;
      const job = await downloadService.getJob(jobId);
      if (!job) return res.status(404).json({ error: 'Job not found.' });

      await downloadQueueManager.retryFailedTracks(jobId);
      res.json({ success: true, message: 'Retrying failed tracks.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/tracks/:trackId/download
   */
  async downloadIndividualTrack(req, res, next) {
    try {
      const { trackId } = req.params;
      const db = getDB();
      const rows = await db.query(sql`SELECT * FROM download_tracks WHERE id = ${trackId}`);
      const track = rows[0];
      if (!track) {
        return res.status(404).json({ error: 'Track not found.' });
      }

      // 1. Strict rights verification on the server
      const unauthorizedStatuses = ['REJECTED', 'UNSUPPORTED_CC_CLAIM', 'UNVERIFIED_RIGHTS'];
      if (unauthorizedStatuses.includes(track.rights_status)) {
        return res.status(403).json({
          error: `Download forbidden: Audio source is classified as ${track.rights_status} under copyright policy.`,
        });
      }

      // 2. Missing rights or provider
      if (!track.rights_status || track.rights_status === 'UNVERIFIED' || (!track.source_license && !track.audio_provider)) {
        return res.status(400).json({
          error: 'Download forbidden: Missing verified rights information or audio provider.',
        });
      }

      // 3. Unavailable or needs review
      if (track.download_status === 'UNAVAILABLE') {
        return res.status(400).json({
          error: 'Cannot download: No authorized audio source available for this track.',
        });
      }
      if (track.download_status === 'NEEDS_REVIEW') {
        return res.status(400).json({
          error: 'Cannot download: Audio candidate requires manual review.',
        });
      }

      await downloadQueueManager.retryTrack(trackId);
      res.json({ success: true, message: 'Track download queued.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/tracks/:trackId/cancel
   */
  async cancelTrack(req, res, next) {
    try {
      const { trackId } = req.params;
      const db = getDB();
      const rows = await db.query(sql`SELECT id FROM download_tracks WHERE id = ${trackId}`);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Track not found.' });
      }

      await downloadQueueManager.cancelTrack(trackId);
      res.json({ success: true, message: 'Track download cancelled.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/tracks/:trackId/retry
   */
  async retryTrack(req, res, next) {
    try {
      const { trackId } = req.params;
      const db = getDB();
      const rows = await db.query(sql`SELECT * FROM download_tracks WHERE id = ${trackId}`);
      const track = rows[0];
      if (!track) {
        return res.status(404).json({ error: 'Track not found.' });
      }

      const unauthorizedStatuses = ['REJECTED', 'UNSUPPORTED_CC_CLAIM', 'UNVERIFIED_RIGHTS'];
      if (unauthorizedStatuses.includes(track.rights_status)) {
        return res.status(403).json({
          error: `Retry forbidden: Audio source is classified as ${track.rights_status} under copyright policy.`,
        });
      }

      if (!track.rights_status || track.rights_status === 'UNVERIFIED' || (!track.source_license && !track.audio_provider)) {
        return res.status(400).json({
          error: 'Cannot retry: Missing verified rights information or audio provider.',
        });
      }

      if (track.download_status === 'UNAVAILABLE') {
        return res.status(400).json({
          error: 'Cannot retry: Track has no available audio source.',
        });
      }

      await downloadQueueManager.retryTrack(trackId);
      res.json({ success: true, message: 'Track retried.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/downloads/tracks/:trackId/sources
   */
  async searchSources(req, res, next) {
    try {
      const { trackId } = req.params;
      const db = getDB();
      const rows = await db.query(sql`SELECT id FROM download_tracks WHERE id = ${trackId}`);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Track not found.' });
      }

      const candidates = await downloadService.searchAudioCandidates(trackId);
      res.json({ candidates });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/tracks/:trackId/confirm-source
   */
  async confirmSource(req, res, next) {
    try {
      const { trackId } = req.params;
      const { provider, sourceTrackId } = req.body;
      if (!sourceTrackId) {
        return res.status(400).json({ error: 'sourceTrackId is required.' });
      }

      const db = getDB();
      const rows = await db.query(sql`SELECT * FROM download_tracks WHERE id = ${trackId}`);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Track not found.' });
      }

      const info = await downloadService.confirmAudioMatch(trackId, provider || 'jamendo', sourceTrackId);
      res.json({ success: true, match: info });
    } catch (err) {
      if (err.statusCode) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      next(err);
    }
  }

  /**
   * GET /api/downloads/jobs/:jobId/validation-report
   */
  async getValidationReport(req, res, next) {
    try {
      const { jobId } = req.params;
      const report = await downloadService.getValidationReport(jobId);
      if (!report) {
        return res.status(404).json({ error: 'Validation report not found.' });
      }
      res.json(report);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/downloads/tracks/:trackId/lyrics
   */
  async getLyrics(req, res, next) {
    try {
      const { trackId } = req.params;
      const db = getDB();
      const rows = await db.query(sql`
        SELECT * FROM lyrics_metadata WHERE track_id = ${trackId}
      `);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Lyrics not found for this track.' });
      }
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/downloads/tracks/:trackId/confirm-lyrics
   */
  async confirmLyrics(req, res, next) {
    try {
      const { trackId } = req.params;
      const { confirmed } = req.body;
      await lyricsService.confirmLyricsMatch(trackId, Boolean(confirmed));
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/downloads/jobs/:jobId/export
   */
  async exportZip(req, res, next) {
    try {
      const { jobId } = req.params;
      await zipExportService.streamJobZip(jobId, res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/downloads/jobs/:jobId/events
   * Server-Sent Events (SSE) live stream for job and track status updates.
   */
  async eventsStream(req, res) {
    const { jobId } = req.params;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Initial ping
    sendEvent('connected', { jobId, timestamp: Date.now() });

    // Send state sync event immediately so new or reconnecting clients receive current DB state
    try {
      const progress = await downloadService.getJobProgress(jobId);
      if (progress) {
        sendEvent('sync_state', { jobId, progress, timestamp: Date.now() });
      }
    } catch (_) {}

    const onProgress = (payload) => {
      if (payload.jobId === jobId) {
        sendEvent('track_progress', payload);
      }
    };

    const onTrackUpdated = (payload) => {
      if (payload.jobId === jobId) {
        sendEvent('track_updated', payload);
      }
    };

    const onJobUpdated = (payload) => {
      if (payload.jobId === jobId) {
        sendEvent('job_updated', payload);
      }
    };

    downloadQueueManager.on('track_progress', onProgress);
    downloadQueueManager.on('track_updated', onTrackUpdated);
    downloadQueueManager.on('job_updated', onJobUpdated);

    // Keep-alive heartbeat every 15s
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      downloadQueueManager.off('track_progress', onProgress);
      downloadQueueManager.off('track_updated', onTrackUpdated);
      downloadQueueManager.off('job_updated', onJobUpdated);
    });
  }
}

module.exports = new DownloadController();
