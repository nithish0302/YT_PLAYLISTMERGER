const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getDB, sql } = require('../db');
const fileStorageService = require('./fileStorageService');
const audioMetadataService = require('./audioMetadataService');
const lyricsService = require('./lyricsService');
const { getProvider, searchAllProviders } = require('./providers');

class DownloadQueueManager extends EventEmitter {
  constructor(concurrency = 2) {
    super();
    this.concurrency = concurrency;
    this.maxConcurrent = concurrency;
    this.activeDownloads = new Map(); // trackId -> { controller, tempFilePath }
    this.isPaused = new Map(); // jobId -> boolean
    this.isCancelled = new Map(); // jobId -> boolean
    this.queue = []; // array of trackId
    this.processing = false;

    // Recover queue state on boot
    this.recoverInterruptedTasks();
  }

  /**
   * Clean up partial or failed .tmp download files from disk.
   */
  cleanupPartialFile(filePath) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.warn('[DownloadQueue] Could not clean partial file:', e.message);
    }
  }

  /**
   * Reset any previously interrupted DOWNLOADING tracks after a server restart.
   */
  async recoverInterruptedTasks() {
    try {
      const db = getDB();
      // Reset tracks stuck in DOWNLOADING or SEARCHING to READY
      await db.query(sql`
        UPDATE download_tracks
        SET download_status = 'READY', download_progress = 0
        WHERE download_status = 'DOWNLOADING'
      `);

      // Reset any jobs stuck in DOWNLOADING to PAUSED
      await db.query(sql`
        UPDATE download_jobs
        SET status = 'PAUSED'
        WHERE status = 'DOWNLOADING'
      `);
      console.log('[DownloadQueue] Recovered interrupted queue states.');
    } catch (err) {
      console.warn('[DownloadQueue] Recovery warning:', err.message);
    }
  }

  /**
   * Enqueue eligible tracks for a job and start processing.
   */
  async startQueue(jobId) {
    const db = getDB();
    this.isPaused.set(jobId, false);
    this.isCancelled.delete(jobId);

    await db.query(sql`
      UPDATE download_jobs
      SET status = 'DOWNLOADING', updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${jobId}
    `);

    // Fetch tracks that are READY (or PENDING) and not rejected under copyright policy
    const tracks = await db.query(sql`
      SELECT id FROM download_tracks
      WHERE job_id = ${jobId}
        AND download_status IN ('READY', 'PENDING')
        AND (rights_status IS NULL OR rights_status NOT IN ('REJECTED', 'UNSUPPORTED_CC_CLAIM', 'UNVERIFIED_RIGHTS'))
      ORDER BY playlist_position ASC
    `);

    for (const t of tracks) {
      if (!this.queue.includes(t.id) && !this.activeDownloads.has(t.id)) {
        this.queue.push(t.id);
      }
    }

    this.emitJobUpdate(jobId);
    this.processNext();
  }

  /**
   * Pause a running job's queue.
   */
  async pauseQueue(jobId) {
    this.isPaused.set(jobId, true);
    const db = getDB();
    await db.query(sql`
      UPDATE download_jobs
      SET status = 'PAUSED', updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${jobId}
    `);

    this.emitJobUpdate(jobId);
  }

  /**
   * Cancel the entire queue for a job, aborting active downloads and resetting statuses.
   */
  async cancelQueue(jobId) {
    this.isPaused.set(jobId, true);
    this.isCancelled.set(jobId, true);
    const db = getDB();

    // Abort active downloads for this job
    for (const [trackId, active] of this.activeDownloads.entries()) {
      try {
        const rows = await db.query(sql`SELECT job_id FROM download_tracks WHERE id = ${trackId}`);
        if (rows[0] && rows[0].job_id === jobId) {
          active.controller.abort();
          if (active.tempFilePath && fs.existsSync(active.tempFilePath)) {
            try { fs.unlinkSync(active.tempFilePath); } catch {}
          }
          this.activeDownloads.delete(trackId);
        }
      } catch (e) {
        console.warn(`[DownloadQueue] Error aborting track ${trackId}:`, e.message);
      }
    }

    // Filter out tracks of this job from queue
    const jobTracks = await db.query(sql`SELECT id FROM download_tracks WHERE job_id = ${jobId}`);
    const jobTrackIds = new Set(jobTracks.map((t) => t.id));
    this.queue = this.queue.filter((id) => !jobTrackIds.has(id));

    // Mark pending/ready/downloading tracks as CANCELLED
    await db.query(sql`
      UPDATE download_tracks
      SET download_status = 'CANCELLED', download_progress = 0, updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE job_id = ${jobId} AND download_status IN ('READY', 'PENDING', 'DOWNLOADING')
    `);

    // Mark job as CANCELLED
    await db.query(sql`
      UPDATE download_jobs
      SET status = 'CANCELLED', updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${jobId}
    `);

    await this.updateJobStats(jobId);
    this.emitJobUpdate(jobId);
  }

  /**
   * Resume a paused queue.
   */
  async resumeQueue(jobId) {
    return this.startQueue(jobId);
  }

  /**
   * Cancel an individual track download and remove partial files.
   */
  async cancelTrack(trackId) {
    const active = this.activeDownloads.get(trackId);
    if (active) {
      active.controller.abort();
      if (active.tempFilePath && fs.existsSync(active.tempFilePath)) {
        try { fs.unlinkSync(active.tempFilePath); } catch {}
      }
      this.activeDownloads.delete(trackId);
    }

    // Remove from in-memory queue
    this.queue = this.queue.filter((id) => id !== trackId);

    const db = getDB();
    await db.query(sql`
      UPDATE download_tracks
      SET download_status = 'CANCELLED', download_progress = 0, updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${trackId}
    `);

    const rows = await db.query(sql`SELECT job_id FROM download_tracks WHERE id = ${trackId}`);
    if (rows[0]) {
      await this.updateJobStats(rows[0].job_id);
      this.emitTrackUpdate(rows[0].job_id, trackId);
    }
  }

  /**
   * Retry an individual failed track.
   */
  async retryTrack(trackId) {
    const db = getDB();
    const rows = await db.query(sql`SELECT * FROM download_tracks WHERE id = ${trackId}`);
    const track = rows[0];
    if (!track) {
      const err = new Error('Track not found.');
      err.statusCode = 404;
      throw err;
    }

    // Do not retry tracks rejected under copyright policy
    if (['REJECTED', 'UNSUPPORTED_CC_CLAIM', 'UNVERIFIED_RIGHTS'].includes(track.rights_status)) {
      const err = new Error(`Cannot retry: Audio source is classified as ${track.rights_status} under copyright policy.`);
      err.statusCode = 403;
      throw err;
    }

    // Do not retry UNAVAILABLE tracks automatically per specification
    if (track.download_status === 'UNAVAILABLE') {
      const err = new Error('Cannot retry unavailable track without a confirmed authorized source.');
      err.statusCode = 400;
      throw err;
    }

    await db.query(sql`
      UPDATE download_tracks
      SET download_status = 'READY', download_progress = 0, error_message = NULL,
          retry_count = retry_count + 1, updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${trackId}
    `);

    if (!this.queue.includes(trackId)) {
      this.queue.push(trackId);
    }

    this.emitTrackUpdate(track.job_id, trackId);
    this.processNext();
  }

  /**
   * Retry all failed tracks for a job.
   */
  async retryFailedTracks(jobId) {
    const db = getDB();
    await db.query(sql`
      UPDATE download_tracks
      SET download_status = 'READY', download_progress = 0, error_message = NULL,
          retry_count = retry_count + 1, updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE job_id = ${jobId} AND download_status = 'FAILED'
        AND (rights_status IS NULL OR rights_status NOT IN ('REJECTED', 'UNSUPPORTED_CC_CLAIM', 'UNVERIFIED_RIGHTS'))
    `);

    return this.startQueue(jobId);
  }

  /**
   * Process the next item in the queue respecting concurrency limit.
   */
  async processNext() {
    if (this.activeDownloads.size >= this.concurrency) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    const trackId = this.queue.shift();
    if (!trackId) return;

    const db = getDB();
    const rows = await db.query(sql`SELECT * FROM download_tracks WHERE id = ${trackId}`);
    const track = rows[0];
    if (!track) {
      this.processNext();
      return;
    }

    // Check if the job is paused
    if (this.isPaused.get(track.job_id)) {
      this.processNext();
      return;
    }

    const abortController = new AbortController();
    this.activeDownloads.set(trackId, { controller: abortController, tempFilePath: null });

    // Execute track download task
    this.downloadSingleTrack(track, abortController)
      .finally(() => {
        this.activeDownloads.delete(trackId);
        this.updateJobStats(track.job_id);
        this.processNext();
      });

    // Check if we can pick up another track simultaneously (concurrency = 2)
    if (this.activeDownloads.size < this.concurrency) {
      this.processNext();
    }
  }

  /**
   * Core download worker for a single track.
   */
  async downloadSingleTrack(track, abortController) {
    const db = getDB();
    const jobId = track.job_id;
    let tempFilePath = null;

    try {
      // Safety check: Never download rejected rights tracks
      if (['REJECTED', 'UNSUPPORTED_CC_CLAIM', 'UNVERIFIED_RIGHTS'].includes(track.rights_status)) {
        await db.query(sql`
          UPDATE download_tracks
          SET download_status = 'UNAVAILABLE', error_message = 'Download blocked: Audio source violates copyright policy.',
              updated_at = ${Math.floor(Date.now() / 1000)}
          WHERE id = ${track.id}
        `);
        this.emitTrackUpdate(jobId, track.id);
        return;
      }

      // 1. Mark status DOWNLOADING
      await db.query(sql`
        UPDATE download_tracks
        SET download_status = 'DOWNLOADING', download_progress = 0, error_message = NULL,
            updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${track.id}
      `);
      this.emitTrackUpdate(jobId, track.id);

      // 2. Ensure authorized source is resolved across all providers
      let sourceUrl = track.source_url;
      let audioFormat = track.audio_format || 'flac';
      let providerName = track.audio_provider || 'jamendo';
      let license = track.source_license;
      let sourceTrackId = track.source_track_id;

      if (!sourceUrl) {
        const candidates = await searchAllProviders({
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
        }, 'flac');

        const bestMatch = candidates.find((c) => c.downloadAllowed && c.downloadUrl && c.matchOutcome !== 'NO_MATCH');

        if (!bestMatch) {
          await db.query(sql`
            UPDATE download_tracks
            SET download_status = 'UNAVAILABLE', error_message = 'No authorized download available on audio providers',
                updated_at = ${Math.floor(Date.now() / 1000)}
            WHERE id = ${track.id}
          `);
          this.emitTrackUpdate(jobId, track.id);
          return;
        }

        if (bestMatch.matchOutcome === 'NEEDS_REVIEW') {
          // Do not download automatically if needs user review
          await db.query(sql`
            UPDATE download_tracks
            SET download_status = 'NEEDS_REVIEW',
                audio_provider = ${bestMatch.provider},
                source_track_id = ${bestMatch.providerTrackId},
                source_url = ${bestMatch.downloadUrl},
                source_license = ${bestMatch.licenseName},
                license_url = ${bestMatch.licenseUrl || null},
                attribution = ${bestMatch.attribution || null},
                audio_format = ${bestMatch.format},
                match_outcome = 'NEEDS_REVIEW',
                match_score = ${bestMatch.matchScore || 0.0},
                error_message = 'Candidate requires manual review before download.',
                updated_at = ${Math.floor(Date.now() / 1000)}
            WHERE id = ${track.id}
          `);
          this.emitTrackUpdate(jobId, track.id);
          return;
        }

        sourceUrl = bestMatch.downloadUrl;
        audioFormat = bestMatch.format || 'flac';
        providerName = bestMatch.provider;
        license = bestMatch.licenseName;
        sourceTrackId = bestMatch.providerTrackId;

        await db.query(sql`
          UPDATE download_tracks
          SET audio_provider = ${providerName}, source_track_id = ${sourceTrackId},
              source_url = ${sourceUrl}, source_license = ${license},
              license_url = ${bestMatch.licenseUrl || null},
              attribution = ${bestMatch.attribution || null},
              audio_format = ${audioFormat},
              match_outcome = 'HIGH_CONFIDENCE',
              match_score = ${bestMatch.matchScore || 1.0}
          WHERE id = ${track.id}
        `);
      }

      // 3. Prepare destination file path
      const jobDir = fileStorageService.getJobDirectory(jobId);
      const filename = fileStorageService.getStandardFilename(
        track.playlist_position,
        track.artist,
        track.title,
        audioFormat
      );
      tempFilePath = path.join(jobDir, `${filename}.tmp`);
      const finalFilePath = path.join(jobDir, filename);

      // Register active temp path for cancel cleanup
      const activeObj = this.activeDownloads.get(track.id);
      if (activeObj) activeObj.tempFilePath = tempFilePath;

      // Clean up any stale partial temp file first
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }

      // PRE-STREAM AUTHORIZATION & IDENTITY REVALIDATION (Phase 6):
      // Re-verify database state immediately before accessing sourceUrl
      const currentTrackRows = await db.query(sql`SELECT * FROM download_tracks WHERE id = ${track.id}`);
      const freshTrack = currentTrackRows[0];
      if (!freshTrack) {
        throw new Error('Track record disappeared prior to streaming.');
      }

      // 1. Enforce strict track identity and job association immutability
      if (freshTrack.job_id !== jobId || freshTrack.video_id !== track.video_id) {
        await db.query(sql`
          UPDATE download_tracks
          SET download_status = 'UNAVAILABLE', error_message = 'Security violation: Track association or identity mismatch detected.',
              updated_at = ${Math.floor(Date.now() / 1000)}
          WHERE id = ${track.id}
        `);
        this.emitTrackUpdate(jobId, track.id);
        return;
      }

      // 2. Revalidate rights authorization status
      if (['REJECTED', 'UNSUPPORTED_CC_CLAIM', 'UNVERIFIED_RIGHTS'].includes(freshTrack.rights_status) || freshTrack.rights_status === 'UNAUTHORIZED') {
        await db.query(sql`
          UPDATE download_tracks
          SET download_status = 'UNAVAILABLE', error_message = 'Download blocked: Stale authorization or copyright violation.',
              updated_at = ${Math.floor(Date.now() / 1000)}
          WHERE id = ${track.id}
        `);
        this.emitTrackUpdate(jobId, track.id);
        return;
      }

      // 3. Pre-stream audit if candidate is from Internet Archive
      if ((providerName || '').toLowerCase().includes('archive') || (sourceUrl || '').toLowerCase().includes('archive.org')) {
        const dataIntegrityService = require('./dataIntegrityService');
        const audit = dataIntegrityService.classifyInternetArchiveRights({
          candidate_title: track.title,
          source_url: sourceUrl,
          license_name: license || '',
        });
        if (['UNSUPPORTED_CC_CLAIM', 'REJECTED', 'UNVERIFIED_RIGHTS', 'DERIVATIVE_UNAUTHORIZED', 'BOOTLEG_UNAUTHORIZED'].includes(audit.rightsStatus) || audit.downloadAllowed === false) {
          await db.query(sql`
            UPDATE download_tracks
            SET download_status = 'UNAVAILABLE', error_message = 'Download blocked: Audio source violates copyright policy upon pre-stream audit.',
                updated_at = ${Math.floor(Date.now() / 1000)}
            WHERE id = ${track.id}
          `);
          this.emitTrackUpdate(jobId, track.id);
          return;
        }
      }

      // 4. Validate external source URL to prevent SSRF
      if (!sourceUrl.startsWith('file://')) {
        const { validateExternalUrl } = require('../utils/securityUtils');
        try {
          validateExternalUrl(sourceUrl);
        } catch (ssrfErr) {
          await db.query(sql`
            UPDATE download_tracks
            SET download_status = 'UNAVAILABLE', error_message = ${'Download blocked: ' + ssrfErr.message},
                updated_at = ${Math.floor(Date.now() / 1000)}
            WHERE id = ${track.id}
          `);
          this.emitTrackUpdate(jobId, track.id);
          return;
        }
      }

      // 5. Stream audio download with actual byte progress tracking
      const response = await axios({
        method: 'GET',
        url: sourceUrl,
        responseType: 'stream',
        signal: abortController.signal,
        timeout: 45000,
        maxContentLength: 200 * 1024 * 1024, // 200MB safety ceiling
        headers: {
          'User-Agent': 'YT_PlaylistMerger/1.0 (https://github.com/nithish0302/YT_PLAYLISTMERGER)',
        },
      });

      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;
      let lastReportedProgress = 0;

      const writeStream = fs.createWriteStream(tempFilePath);

      await new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          downloadedBytes += chunk.length;

          if (totalBytes && !isNaN(totalBytes) && totalBytes > 0) {
            const pct = Math.floor((downloadedBytes / totalBytes) * 100);
            if (pct >= lastReportedProgress + 5 || pct === 100) {
              lastReportedProgress = pct;
              this.emit('track_progress', {
                jobId,
                trackId: track.id,
                progress: pct,
                downloadedBytes,
                totalBytes,
              });
            }
          } else {
            // Indeterminate progress per specification: do not fabricate percentage!
            this.emit('track_progress', {
              jobId,
              trackId: track.id,
              progress: -1,
              downloadedBytes,
              totalBytes: null,
            });
          }
        });

        response.data.pipe(writeStream);

        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        response.data.on('error', reject);
      });

      // Move temporary download file to final path
      if (fs.existsSync(finalFilePath)) {
        fs.unlinkSync(finalFilePath);
      }
      fs.renameSync(tempFilePath, finalFilePath);

      const fileStats = fs.statSync(finalFilePath);

      // 5. Inspect real audio file metadata
      const inspection = await audioMetadataService.inspectAudioFile(finalFilePath);

      if (!inspection.verified) {
        // Remove corrupted or unverified file
        if (fs.existsSync(finalFilePath)) {
          fs.unlinkSync(finalFilePath);
        }
        throw new Error(inspection.error || 'Downloaded audio file failed verification.');
      }

      // Register audio file in download_files
      await fileStorageService.registerAudioFile({
        trackId: track.id,
        filePath: finalFilePath,
        filename,
        size: fileStats.size,
        mimeType: inspection.audioFormat === 'flac' ? 'audio/flac' : 'audio/mpeg',
      });

      // 6. Fetch lyrics from LRCLIB
      const lyricsResult = await lyricsService.fetchLyricsForTrack({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: inspection.duration || track.duration,
      });

      // Save lyrics files (.lrc and/or .txt) if present
      if (lyricsResult.syncedLyrics) {
        const lrcFilename = fileStorageService.getStandardFilename(
          track.playlist_position,
          track.artist,
          track.title,
          'lrc'
        );
        await fileStorageService.saveTextFile({
          jobId,
          trackId: track.id,
          filename: lrcFilename,
          content: lyricsResult.syncedLyrics,
          fileType: 'lrc',
        });
      }

      if (lyricsResult.plainLyrics) {
        const txtFilename = fileStorageService.getStandardFilename(
          track.playlist_position,
          track.artist,
          track.title,
          'txt'
        );
        await fileStorageService.saveTextFile({
          jobId,
          trackId: track.id,
          filename: txtFilename,
          content: lyricsResult.plainLyrics,
          fileType: 'txt',
        });
      }

      // 7. Determine final status per specification
      // A successfully downloaded and verified audio file is COMPLETED in download_status.
      // Lyrics status is maintained independently in lyrics_status.
      const finalStatus = 'COMPLETED';

      await db.query(sql`
        UPDATE download_tracks
        SET download_status = ${finalStatus},
            lyrics_status = ${lyricsResult.status},
            download_progress = 100,
            actual_bitrate = ${inspection.actualBitrate || null},
            sample_rate = ${inspection.sampleRate || null},
            audio_format = ${inspection.audioFormat},
            duration = ${inspection.duration || track.duration},
            local_file_path = ${finalFilePath},
            error_message = NULL,
            updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${track.id}
      `);

      this.emitTrackUpdate(jobId, track.id);
    } catch (err) {
      // Clean up partial temp download file on error
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch {}
      }

      if (err.name === 'CanceledError' || err.message === 'canceled') {
        return; // Handled in cancelTrack
      }

      console.error(`[DownloadQueue] Track ${track.id} failed:`, err.message);

      const isDiskSpace = err.code === 'ENOSPC' || err.message.includes('ENOSPC') || err.message.includes('no space');
      const errorMsg = isDiskSpace
        ? 'Insufficient disk space to complete download.'
        : (err.message || 'Technical download error');

      await db.query(sql`
        UPDATE download_tracks
        SET download_status = 'FAILED', error_message = ${errorMsg},
            download_progress = 0, updated_at = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${track.id}
      `);

      this.emitTrackUpdate(jobId, track.id);
    }
  }

  /**
   * Recompute summary counters for a download job.
   */
  async updateJobStats(jobId) {
    const db = getDB();
    const rows = await db.query(sql`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN download_status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN download_status = 'PARTIAL' THEN 1 ELSE 0 END) as partial,
        SUM(CASE WHEN download_status = 'UNAVAILABLE' THEN 1 ELSE 0 END) as unavailable,
        SUM(CASE WHEN download_status = 'NEEDS_REVIEW' THEN 1 ELSE 0 END) as needs_review,
        SUM(CASE WHEN download_status = 'FAILED' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN download_status IN ('DOWNLOADING', 'SEARCHING') THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN download_status IN ('PENDING', 'READY') THEN 1 ELSE 0 END) as remaining
      FROM download_tracks
      WHERE job_id = ${jobId}
    `);

    const stats = rows[0] || {};
    const total = stats.total || 0;
    const completed = stats.completed || 0;
    const partial = stats.partial || 0;
    const unavailable = stats.unavailable || 0;
    const failed = stats.failed || 0;
    const active = stats.active || 0;
    const remaining = stats.remaining || 0;

    let newStatus = 'DOWNLOADING';
    if (this.isCancelled.get(jobId)) {
      newStatus = 'CANCELLED';
    } else if (this.isPaused.get(jobId)) {
      newStatus = 'PAUSED';
    } else if (active === 0 && remaining === 0) {
      if (completed + partial === total) {
        newStatus = completed === total ? 'COMPLETED' : 'PARTIAL';
      } else if (failed > 0 && completed === 0 && partial === 0) {
        newStatus = 'FAILED';
      } else {
        newStatus = 'COMPLETED';
      }
    }

    await db.query(sql`
      UPDATE download_jobs
      SET total_tracks = ${total},
          completed_tracks = ${completed},
          partial_tracks = ${partial},
          unavailable_tracks = ${unavailable},
          failed_tracks = ${failed},
          status = ${newStatus},
          updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${jobId}
    `);

    this.emitJobUpdate(jobId);
  }

  async emitTrackUpdate(jobId, trackId) {
    const db = getDB();
    const rows = await db.query(sql`
      SELECT t.*, lm.plain_lyrics, lm.synced_lyrics, lm.match_confidence, lm.needs_confirmation
      FROM download_tracks t
      LEFT JOIN lyrics_metadata lm ON t.id = lm.track_id
      WHERE t.id = ${trackId}
    `);
    if (rows[0]) {
      this.emit('track_updated', { jobId, track: rows[0] });
    }
  }

  async emitJobUpdate(jobId) {
    const db = getDB();
    const rows = await db.query(sql`SELECT * FROM download_jobs WHERE id = ${jobId}`);
    if (rows[0]) {
      this.emit('job_updated', { jobId, job: rows[0] });
    }
  }
}

module.exports = new DownloadQueueManager(2);
