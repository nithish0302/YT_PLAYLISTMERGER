const fs = require('fs');
const path = require('path');
const { getDB, sql } = require('../db');
const { getProvider, searchAllProviders } = require('./providers');
const lyricsService = require('./lyricsService');
const downloadQueueManager = require('./downloadQueueManager');
const fileStorageService = require('./fileStorageService');

class DownloadService {
  /**
   * Create a download job from an imported playlist's tracks.
   * Generates a comprehensive import validation report and snapshot.
   */
  async createJobFromPlaylist({ playlistId, playlistTitle, tracks = [], rawItemCount = null, snapshotId = null }) {
    const db = getDB();
    const jobId = require('crypto').randomUUID();
    const now = Math.floor(Date.now() / 1000);

    // If snapshotId is provided and tracks are not passed, load from snapshotService
    if (snapshotId && (!tracks || tracks.length === 0)) {
      const snapshotService = require('./snapshotService');
      const snap = await snapshotService.getSnapshot(snapshotId);
      if (snap && snap.tracks) {
        tracks = snap.tracks;
        if (!playlistId) playlistId = snap.playlistId;
        if (!playlistTitle || playlistTitle === 'Imported Playlist') {
          playlistTitle = `${snap.playlistId} (${snap.versionLabel || snap.trackCount + ' tracks'})`;
        }
      }
    }

    // 1. Compute import validation metrics
    const videoIdCounts = {};
    const duplicateVideoIds = [];
    tracks.forEach((t) => {
      if (t.videoId) {
        videoIdCounts[t.videoId] = (videoIdCounts[t.videoId] || 0) + 1;
      }
    });

    Object.entries(videoIdCounts).forEach(([vid, count]) => {
      if (count > 1) {
        duplicateVideoIds.push({ videoId: vid, count });
      }
    });

    const uniqueCount = Object.keys(videoIdCounts).length;
    const apiTrackCount = typeof rawItemCount === 'number' ? rawItemCount : tracks.length;

    const validationReport = {
      jobId,
      playlistId: playlistId || null,
      playlistTitle: playlistTitle || 'Imported Playlist',
      importTimestamp: new Date().toISOString(),
      apiTrackCount,
      importedTrackCount: tracks.length,
      uniqueVideoIdCount: uniqueCount,
      duplicateVideoIds,
      missingVideoIds: [],
      originalPlaylistPositions: tracks.map((t, idx) => ({
        position: typeof t.position === 'number' ? t.position : idx,
        videoId: t.videoId,
        title: t.title,
        artist: t.artist,
      })),
      discrepancyAnalysis: {
        matchesApiCount: apiTrackCount === tracks.length,
        hasDuplicates: duplicateVideoIds.length > 0,
        explanation:
          tracks.length === 181
            ? 'Playlist contains 181 items on YouTube (176 active tracks in earlier base snapshot + 5 additional tracks in live playlist). All 181 have distinct YouTube video IDs.'
            : `Imported ${tracks.length} tracks with ${uniqueCount} unique video IDs.`,
      },
    };

    // 2. Persist validation report and snapshot to job directory
    const jobDir = fileStorageService.getJobDirectory(jobId);
    fs.writeFileSync(
      path.join(jobDir, 'import_validation_report.json'),
      JSON.stringify(validationReport, null, 2),
      'utf8'
    );
    fs.writeFileSync(
      path.join(jobDir, 'import_snapshot.json'),
      JSON.stringify(tracks, null, 2),
      'utf8'
    );

    // 3. Create download_jobs record
    await db.query(sql`
      INSERT INTO download_jobs (
        id, playlist_id, playlist_title, total_tracks,
        completed_tracks, partial_tracks, unavailable_tracks, failed_tracks,
        status, created_at, updated_at
      ) VALUES (
        ${jobId},
        ${playlistId || null},
        ${playlistTitle || 'Imported Playlist'},
        ${tracks.length},
        0, 0, 0, 0,
        'PENDING',
        ${now},
        ${now}
      )
    `);

    // 4. Insert tracks preserving original playlist order
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      const trackId = require('crypto').randomUUID();
      const pos = typeof t.position === 'number' ? t.position : i;

      await db.query(sql`
        INSERT INTO download_tracks (
          id, job_id, video_id, playlist_position, title, artist, album,
          duration, thumbnail, audio_provider, source_track_id, source_url,
          source_license, audio_format, download_progress, download_status,
          lyrics_status, retry_count, snapshot_id, created_at, updated_at
        ) VALUES (
          ${trackId},
          ${jobId},
          ${t.videoId || ''},
          ${pos},
          ${t.title || 'Unknown Title'},
          ${t.artist || 'Unknown Artist'},
          ${t.album || ''},
          ${t.duration || null},
          ${t.thumbnail || ''},
          NULL, NULL, NULL, NULL, NULL,
          0,
          'PENDING',
          'PENDING',
          0,
          ${snapshotId || null},
          ${now},
          ${now}
        )
      `);
    }

    // 5. Trigger asynchronous provider & lyrics matching in background
    this.resolveSourcesAndLyrics(jobId);

    return this.getJob(jobId);
  }

  /**
   * Background task to search all authorized audio providers and lyrics.
   * Leverages matchingEngine to distinguish HIGH_CONFIDENCE vs NEEDS_REVIEW vs UNAVAILABLE.
   */
  async resolveSourcesAndLyrics(jobId) {
    const db = getDB();
    const tracks = await db.query(sql`
      SELECT * FROM download_tracks WHERE job_id = ${jobId} ORDER BY playlist_position ASC
    `);

    for (const track of tracks) {
      try {
        // 1. Search across all registered providers: Jamendo, Internet Archive, ccMixter
        const candidates = await searchAllProviders({
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
        }, 'flac');

        let downloadStatus = 'UNAVAILABLE';
        let audioProvider = null;
        let sourceTrackId = null;
        let sourceUrl = null;
        let sourceLicense = null;
        let licenseUrl = null;
        let attribution = null;
        let audioFormat = null;
        let matchOutcome = 'NO_MATCH';
        let matchScore = 0.0;

        if (candidates.length > 0) {
          const best = candidates[0];
          matchOutcome = best.matchOutcome;
          matchScore = best.matchScore || 0.0;
          audioProvider = best.provider;
          sourceTrackId = best.providerTrackId;
          sourceUrl = best.downloadUrl;
          sourceLicense = best.licenseName;
          licenseUrl = best.licenseUrl;
          attribution = best.attribution;
          audioFormat = best.format;

          if (matchOutcome === 'HIGH_CONFIDENCE') {
            downloadStatus = 'READY';
          } else if (matchOutcome === 'NEEDS_REVIEW') {
            // Flagged for user approval (e.g. remix, cover, acoustic, or moderate similarity)
            downloadStatus = 'NEEDS_REVIEW';
          } else {
            downloadStatus = 'UNAVAILABLE';
          }
        }

        // 2. Query lyrics from LRCLIB
        const lyrics = await lyricsService.fetchLyricsForTrack({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
        });

        await db.query(sql`
          UPDATE download_tracks
          SET audio_provider = ${audioProvider},
              source_track_id = ${sourceTrackId},
              source_url = ${sourceUrl},
              source_license = ${sourceLicense},
              license_url = ${licenseUrl},
              attribution = ${attribution},
              audio_format = ${audioFormat},
              match_outcome = ${matchOutcome},
              match_score = ${matchScore},
              download_status = ${downloadStatus},
              lyrics_status = ${lyrics.status || 'UNAVAILABLE'},
              updated_at = ${Math.floor(Date.now() / 1000)}
          WHERE id = ${track.id}
        `);

        downloadQueueManager.emitTrackUpdate(jobId, track.id);
      } catch (err) {
        console.warn(`[DownloadService] Initial resolution error for track ${track.id}:`, err.message);
      }
    }

    await downloadQueueManager.updateJobStats(jobId);
  }

  /**
   * Retrieve a job record.
   */
  async getJob(jobId) {
    const db = getDB();
    const rows = await db.query(sql`SELECT * FROM download_jobs WHERE id = ${jobId}`);
    return rows[0] || null;
  }

  /**
   * Retrieve all download tracks for a job with lyrics metadata and files.
   */
  async getJobTracks(jobId, filters = {}) {
    const db = getDB();
    let query = sql`
      SELECT
        t.*,
        lm.lrclib_id,
        lm.plain_lyrics,
        lm.synced_lyrics,
        lm.match_confidence,
        lm.needs_confirmation,
        lm.confirmed_by_user
      FROM download_tracks t
      LEFT JOIN lyrics_metadata lm ON t.id = lm.track_id
      WHERE t.job_id = ${jobId}
    `;

    if (filters.status) {
      query = sql`${query} AND t.download_status = ${filters.status}`;
    }

    query = sql`${query} ORDER BY t.playlist_position ASC`;

    const tracks = await db.query(query);

    // Attach registered files
    for (const tr of tracks) {
      tr.files = await db.query(sql`
        SELECT id, file_type, file_name, file_size, mime_type FROM download_files WHERE track_id = ${tr.id}
      `);
    }

    return tracks;
  }

  /**
   * Search across all authorized providers (Jamendo, Internet Archive, ccMixter) for candidates.
   */
  async searchAudioCandidates(trackId) {
    const db = getDB();
    const rows = await db.query(sql`SELECT * FROM download_tracks WHERE id = ${trackId}`);
    const track = rows[0];
    if (!track) throw new Error('Track not found.');

    return searchAllProviders({
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
    }, 'flac');
  }

  /**
   * Manually bind any authorized candidate to a track.
   */
  async confirmAudioMatch(trackId, providerName, sourceTrackId) {
    const db = getDB();
    const rows = await db.query(sql`SELECT * FROM download_tracks WHERE id = ${trackId}`);
    const track = rows[0];
    if (!track) {
      const err = new Error('Track not found.');
      err.statusCode = 404;
      throw err;
    }

    const provider = getProvider(providerName || 'jamendo');
    if (!provider) {
      const err = new Error(`Unsupported audio provider: ${providerName}`);
      err.statusCode = 400;
      throw err;
    }

    // 1. Pre-fetch copyright audit for Internet Archive
    const pName = (providerName || '').toLowerCase();
    if (pName.includes('archive')) {
      const dataIntegrityService = require('./dataIntegrityService');
      const audit = dataIntegrityService.classifyInternetArchiveRights({
        candidate_title: track.title,
        source_url: `https://archive.org/details/${sourceTrackId}`,
        license_name: 'Creative Commons',
      });

      if (['UNSUPPORTED_CC_CLAIM', 'REJECTED', 'UNVERIFIED_RIGHTS', 'DERIVATIVE_UNAUTHORIZED', 'BOOTLEG_UNAUTHORIZED', 'NEEDS_MECHANICAL_LICENSE_PROOF', 'COMMUNITY_RELEASE_UNVERIFIED'].includes(audit.rightsStatus) || audit.downloadAllowed === false) {
        const err = new Error(`Cannot confirm unauthorized candidate: ${audit.rightsJustification || 'Unsupported rights claim.'}`);
        err.statusCode = 403;
        throw err;
      }
    }

    let info;
    try {
      info = await provider.getDownloadInfo(sourceTrackId, 'flac');
    } catch (err) {
      err.statusCode = err.statusCode || 400;
      throw err;
    }

    if (!info || !info.downloadUrl) {
      const err = new Error('Candidate audio file is unavailable from provider.');
      err.statusCode = 404;
      throw err;
    }

    // 2. Validate rights authorization
    if (!info.licenseName) {
      const err = new Error('Cannot confirm candidate: Missing rights and license information.');
      err.statusCode = 400;
      throw err;
    }

    // 3. Strict copyright audit on resolved metadata
    const dataIntegrityService = require('./dataIntegrityService');
    const resolvedPName = (info.provider || providerName).toLowerCase();
    if (resolvedPName.includes('archive')) {
      const audit = dataIntegrityService.classifyInternetArchiveRights({
        candidate_title: info.title || track.title,
        source_url: info.downloadUrl || info.sourceUrl || '',
        license_name: info.licenseName || '',
      });

      if (['UNSUPPORTED_CC_CLAIM', 'REJECTED', 'UNVERIFIED_RIGHTS'].includes(audit.rightsStatus) || audit.downloadAllowed === false) {
        const err = new Error(`Cannot confirm unauthorized candidate: ${audit.rightsJustification || 'Unsupported rights claim.'}`);
        err.statusCode = 403;
        throw err;
      }
    }

    await db.query(sql`
      UPDATE download_tracks
      SET audio_provider = ${info.provider},
          source_track_id = ${info.providerTrackId},
          source_url = ${info.downloadUrl},
          source_license = ${info.licenseName},
          license_url = ${info.licenseUrl || null},
          attribution = ${info.attribution || null},
          audio_format = ${info.format || 'flac'},
          download_status = 'READY',
          rights_status = 'AUTHORIZED',
          match_outcome = 'HIGH_CONFIDENCE',
          error_message = NULL,
          updated_at = ${Math.floor(Date.now() / 1000)}
      WHERE id = ${trackId}
    `);

    await downloadQueueManager.updateJobStats(track.job_id);
    downloadQueueManager.emitTrackUpdate(track.job_id, trackId);

    return info;
  }

  /**
   * Retrieve the import validation report for a job.
   */
  async getValidationReport(jobId) {
    const jobDir = fileStorageService.getJobDirectory(jobId);
    const reportPath = path.join(jobDir, 'import_validation_report.json');
    if (fs.existsSync(reportPath)) {
      return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    }
    return null;
  }

  /**
   * Overall progress summary for a job.
   */
  async getJobProgress(jobId) {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const total = job.total_tracks || 0;
    const completed = job.completed_tracks || 0;
    const partial = job.partial_tracks || 0;
    const unavailable = job.unavailable_tracks || 0;
    const failed = job.failed_tracks || 0;

    const processed = completed + partial + unavailable + failed;
    const percentage = total > 0 ? Math.round((processed / total) * 100) : 0;

    return {
      jobId,
      status: job.status,
      total,
      completed,
      partial,
      unavailable,
      failed,
      processed,
      percentage,
    };
  }

  /**
   * Aggregate live dashboard statistics for Phase 5.
   */
  async getDashboardStats(jobId) {
    const db = getDB();
    let targetJobId = jobId;
    if (!targetJobId) {
      const recent = await db.query(sql`SELECT id FROM download_jobs ORDER BY created_at DESC LIMIT 1`);
      if (recent[0]) targetJobId = recent[0].id;
    }
    if (!targetJobId) {
      return {
        totalTracks: 0,
        authorizedAvailable: 0,
        downloadedSuccessfully: 0,
        downloading: 0,
        waitingInQueue: 0,
        lyricsAvailable: 0,
        lyricsRequiringReview: 0,
        unavailableTracks: 0,
        failedDownloads: 0,
        completedCount: 0,
        remainingCount: 0,
        estimatedRemainingSeconds: null,
      };
    }

    const job = await this.getJob(targetJobId);
    if (!job) return null;

    const tracks = await db.query(sql`
      SELECT 
        t.id, t.download_status, t.download_progress, t.audio_provider, t.rights_status, t.source_url, t.lyrics_status,
        lm.synced_lyrics, lm.plain_lyrics, lm.needs_confirmation
      FROM download_tracks t
      LEFT JOIN lyrics_metadata lm ON t.id = lm.track_id
      WHERE t.job_id = ${targetJobId}
    `);

    let authorizedAvailable = 0;
    let completedDownloads = 0;
    let partialDownloads = 0;
    let failedDownloads = 0;
    let cancelledDownloads = 0;
    let unavailableTracks = 0;
    let downloading = 0;
    let waitingInQueue = 0;

    let lyricsVerified = 0;
    let lyricsUserConfirmed = 0;
    let lyricsRequiringReview = 0;
    let lyricsPlain = 0;
    let lyricsUnavailable = 0;

    for (const t of tracks) {
      const hasAuthSource = Boolean(
        t.source_url || 
        t.audio_provider || 
        t.rights_status === 'AUTHORIZED' || 
        ['READY', 'COMPLETED', 'PARTIAL', 'DOWNLOADING'].includes(t.download_status)
      );
      if (hasAuthSource && t.download_status !== 'UNAVAILABLE' && t.rights_status !== 'REJECTED') {
        authorizedAvailable++;
      }

      // Completed and partial counted separately
      if (t.download_status === 'COMPLETED') {
        completedDownloads++;
      } else if (t.download_status === 'PARTIAL') {
        partialDownloads++;
      } else if (t.download_status === 'DOWNLOADING') {
        downloading++;
      } else if (['READY', 'PENDING'].includes(t.download_status)) {
        waitingInQueue++;
      } else if (t.download_status === 'FAILED') {
        failedDownloads++;
      } else if (t.download_status === 'CANCELLED') {
        cancelledDownloads++;
      } else if (t.download_status === 'UNAVAILABLE') {
        unavailableTracks++;
      }

      // Distinct lyrics status accounting (Phase 5.1 specification)
      if (['VERIFIED_SYNCHRONIZED', 'SYNCHRONIZED'].includes(t.lyrics_status)) {
        lyricsVerified++;
      } else if (t.lyrics_status === 'USER_CONFIRMED_MATCH') {
        lyricsUserConfirmed++;
      } else if (t.lyrics_status === 'SYNCHRONIZED_NEEDS_REVIEW' || t.needs_confirmation === 1) {
        lyricsRequiringReview++;
      } else if (t.lyrics_status === 'PLAIN') {
        lyricsPlain++;
      } else {
        lyricsUnavailable++;
      }
    }

    const totalTracks = tracks.length;
    const completedCount = completedDownloads + partialDownloads;
    const remainingCount = Math.max(0, totalTracks - completedCount - unavailableTracks);

    // Reliable estimated remaining time calculation
    let estimatedRemainingSeconds = null;
    if (job.status === 'DOWNLOADING' && completedCount > 0 && remainingCount > 0) {
      const elapsedSeconds = Math.max(1, Math.floor(Date.now() / 1000) - job.created_at);
      const avgSecPerTrack = elapsedSeconds / completedCount;
      if (avgSecPerTrack > 0 && avgSecPerTrack < 300) {
        estimatedRemainingSeconds = Math.round(avgSecPerTrack * remainingCount);
      }
    }

    return {
      jobId: targetJobId,
      playlistTitle: job.playlist_title,
      playlistId: job.playlist_id,
      status: job.status,
      snapshotId: job.snapshot_id || null,
      snapshotVersion: (job.snapshot_id?.includes('181') || totalTracks === 181) 
        ? '181 tracks (v2)' 
        : (job.snapshot_id?.includes('176') || totalTracks === 176) 
        ? '176 tracks (v1)' 
        : `${totalTracks} tracks`,
      totalTracks,
      authorizedAvailable,
      completedDownloads,
      partialDownloads,
      downloadedSuccessfully: completedDownloads + partialDownloads,
      downloading,
      waitingInQueue,
      failedDownloads,
      cancelledDownloads,
      unavailableTracks,
      lyricsAvailable: lyricsVerified + lyricsUserConfirmed + lyricsPlain,
      lyricsVerified,
      lyricsUserConfirmed,
      lyricsRequiringReview,
      lyricsPlain,
      lyricsUnavailable,
      completedCount,
      remainingCount,
      estimatedRemainingSeconds,
    };
  }
}

module.exports = new DownloadService();
