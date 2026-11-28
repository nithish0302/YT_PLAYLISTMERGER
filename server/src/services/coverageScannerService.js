const crypto = require('crypto');
const { getDB, sql } = require('../db');
const { getAllProviders } = require('./providers');
const lyricsService = require('./lyricsService');
const dataIntegrityService = require('./dataIntegrityService');
const { OUTCOMES } = require('./matchingEngine');

/**
 * Quality tier classification based on actual source metadata.
 * Never claims lossless unless format is genuinely lossless.
 */
function classifyQualityTier(format, bitrate) {
  if (!format) return 'UNKNOWN';
  const f = (format || '').toLowerCase();
  if (f === 'flac' || f === 'wav' || f === 'alac') return 'LOSSLESS';
  if (f === 'mp3' || f === 'ogg' || f === 'aac' || f === 'm4a') {
    if (bitrate && bitrate >= 256000) return 'HIGH_BITRATE_LOSSY';
    if (bitrate && bitrate >= 128000) return 'STANDARD_LOSSY';
    if (bitrate && bitrate > 0) return 'STANDARD_LOSSY';
    return 'UNKNOWN'; // format known but bitrate unknown
  }
  return 'UNKNOWN';
}

class CoverageScannerService {
  constructor() {
    this.activeScanAbortControllers = new Map(); // scanId -> AbortController
    this.providerDelayMs = 500;  // pacing between provider calls
    this.lyricsDelayMs = 400;    // pacing for LRCLIB
    this.maxRetries = 2;
  }

  /**
   * Create a new coverage scan for a playlist.
   */
  async createScan({ playlistId, playlistTitle, tracks }) {
    const db = getDB();
    const scanId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    await db.query(sql`
      INSERT INTO coverage_scans (id, playlist_id, playlist_title, total_tracks, scanned_tracks, status, created_at)
      VALUES (${scanId}, ${playlistId}, ${playlistTitle}, ${tracks.length}, 0, 'PENDING', ${now})
    `);

    return { id: scanId, playlistId, playlistTitle, totalTracks: tracks.length, status: 'PENDING' };
  }

  /**
   * Run the full coverage scan: audio providers + lyrics for every track.
   * Persists progress incrementally. Supports resume after interruption.
   */
  async runScan(scanId, tracks) {
    const db = getDB();
    const now = Math.floor(Date.now() / 1000);

    // Mark scan as running
    await db.query(sql`
      UPDATE coverage_scans SET status = 'RUNNING', started_at = ${now} WHERE id = ${scanId}
    `);

    const abortController = { aborted: false };
    this.activeScanAbortControllers.set(scanId, abortController);

    const providers = getAllProviders();

    try {
      for (let i = 0; i < tracks.length; i++) {
        if (abortController.aborted) {
          await db.query(sql`
            UPDATE coverage_scans SET status = 'PAUSED', scanned_tracks = ${i} WHERE id = ${scanId}
          `);
          return;
        }

        const track = tracks[i];
        const videoId = track.videoId || track.video_id || '';
        const trackId = track.trackId || track.id || `track_${videoId}`;
        const position = track.position !== undefined ? track.position : (track.playlist_position !== undefined ? track.playlist_position : i);

        // Check if this track was already scanned (resume support)
        const existingLyrics = await db.query(sql`
          SELECT id FROM lyrics_candidates WHERE scan_id = ${scanId} AND video_id = ${videoId}
        `);
        if (existingLyrics.length > 0) {
          // Already scanned, skip
          continue;
        }

        // ── Audio Provider Scan ──
        for (const provider of providers) {
          try {
            await this._delay(this.providerDelayMs);

            const candidates = await this._searchWithRetry(provider, {
              title: track.title,
              artist: track.artist,
              album: track.album,
              duration: track.duration,
            });

            // Find the best candidate among results for this provider
            let bestIdx = -1;
            let bestScore = -1;

            for (let ci = 0; ci < candidates.length; ci++) {
              const c = candidates[ci];
              const candidateId = crypto.randomUUID();
              const qualityTier = classifyQualityTier(c.format, c.bitrate);

              // Evaluate rights legitimacy (e.g. Reject unsupported CC assertions on Internet Archive)
              let rightsEval = {
                versionType: 'STUDIO_ORIGINAL',
                rightsStatus: 'SUPPORTED',
                rightsJustification: 'Provider authorized for download.',
                downloadAllowed: Boolean(c.downloadAllowed && c.downloadUrl),
              };

              if (provider.name === 'internet_archive') {
                rightsEval = dataIntegrityService.classifyInternetArchiveRights(c);
              }

              // Determine if download is truly permitted (not just preview and rights verified)
              const downloadPermitted = Boolean(rightsEval.downloadAllowed && c.downloadUrl);

              const isBest = c.matchScore > bestScore && c.matchOutcome !== OUTCOMES.NO_MATCH && (provider.name !== 'internet_archive' ? downloadPermitted : true);
              if (isBest) {
                bestScore = c.matchScore;
                bestIdx = ci;
              }

              // Persist candidate (upsert to avoid duplicates across rescans)
              try {
                await db.query(sql`
                  INSERT INTO audio_candidates (
                    id, scan_id, track_id, playlist_position, original_title, original_artist,
                    video_id, title, artist,
                    provider, provider_track_id,
                    candidate_title, candidate_artist, candidate_album, candidate_duration,
                    source_url, download_url,
                    license_name, license_url, attribution,
                    download_allowed, format, bitrate, quality_tier,
                    rights_status, rights_justification, version_type,
                    match_outcome, match_score, match_reasons, version_discrepancies,
                    is_best, user_confirmed, checked_at
                  ) VALUES (
                    ${candidateId}, ${scanId}, ${trackId}, ${position}, ${track.title}, ${track.artist},
                    ${videoId}, ${track.title}, ${track.artist},
                    ${provider.name}, ${c.providerTrackId || null},
                    ${c.title || null}, ${c.artist || null}, ${c.album || null}, ${c.duration || null},
                    ${c.sourceUrl || null}, ${downloadPermitted ? c.downloadUrl : null},
                    ${c.licenseName || null}, ${c.licenseUrl || null}, ${c.attribution || null},
                    ${downloadPermitted ? 1 : 0},
                    ${c.format || null}, ${c.bitrate || null}, ${qualityTier},
                    ${rightsEval.rightsStatus}, ${rightsEval.rightsJustification}, ${rightsEval.versionType},
                    ${c.matchOutcome || 'NO_MATCH'}, ${c.matchScore || 0},
                    ${JSON.stringify(c.matchReasons || [])},
                    ${JSON.stringify(c.versionDiscrepancies || [])},
                    0, 0, ${Math.floor(Date.now() / 1000)}
                  )
                  ON CONFLICT(scan_id, video_id, provider, provider_track_id) DO UPDATE SET
                    track_id = excluded.track_id,
                    playlist_position = excluded.playlist_position,
                    original_title = excluded.original_title,
                    original_artist = excluded.original_artist,
                    rights_status = excluded.rights_status,
                    rights_justification = excluded.rights_justification,
                    version_type = excluded.version_type,
                    match_outcome = excluded.match_outcome,
                    match_score = excluded.match_score,
                    checked_at = excluded.checked_at
                `);
              } catch (insertErr) {
                // Duplicate key or other DB error — skip silently
                if (!insertErr.message.includes('UNIQUE constraint')) {
                  console.warn(`[CoverageScanner] DB insert warning for ${videoId}/${provider.name}:`, insertErr.message);
                }
              }
            }

            // Mark best candidate per provider
            if (bestIdx >= 0 && candidates[bestIdx]) {
              const bestC = candidates[bestIdx];
              try {
                await db.query(sql`
                  UPDATE audio_candidates SET is_best = 1
                  WHERE scan_id = ${scanId} AND video_id = ${videoId}
                    AND provider = ${provider.name} AND provider_track_id = ${bestC.providerTrackId}
                `);
              } catch (_) {}
            }
          } catch (providerErr) {
            // Record provider-level error as a special candidate row
            const errId = crypto.randomUUID();
            try {
              await db.query(sql`
                INSERT INTO audio_candidates (
                  id, scan_id, video_id, title, artist,
                  provider, provider_track_id,
                  match_outcome, match_score, match_reasons,
                  download_allowed, checked_at
                ) VALUES (
                  ${errId}, ${scanId}, ${videoId},
                  ${track.title}, ${track.artist},
                  ${provider.name}, ${'PROVIDER_ERROR'},
                  'PROVIDER_ERROR', 0,
                  ${JSON.stringify([providerErr.message])},
                  0, ${Math.floor(Date.now() / 1000)}
                )
                ON CONFLICT(scan_id, video_id, provider, provider_track_id) DO UPDATE SET
                  match_outcome = 'PROVIDER_ERROR',
                  match_reasons = excluded.match_reasons,
                  checked_at = excluded.checked_at
              `);
            } catch (_) {}
          }
        }

        // ── Lyrics Scan ──
        try {
          await this._delay(this.lyricsDelayMs);
          const lyricsResult = await this._fetchLyricsForCoverage(track);
          const lyricsId = crypto.randomUUID();

          // Evaluate lyrics integrity and strict status
          const lyricsEval = dataIntegrityService.classifyLyricsIntegrity(track, {
            ...lyricsResult,
            has_synced: lyricsResult.hasSynced ? 1 : 0,
            has_plain: lyricsResult.hasPlain ? 1 : 0,
            is_instrumental: lyricsResult.isInstrumental ? 1 : 0,
            matched_duration: lyricsResult.matchedDuration,
            match_confidence: lyricsResult.confidence,
          });

          await db.query(sql`
            INSERT INTO lyrics_candidates (
              id, scan_id, track_id, playlist_position, original_title, original_artist,
              video_id, title, artist,
              lrclib_id, matched_title, matched_artist, matched_album, matched_duration,
              has_synced, has_plain, is_instrumental,
              match_confidence, status, timestamps_present, verification_notes,
              error_message, checked_at
            ) VALUES (
              ${lyricsId}, ${scanId}, ${trackId}, ${position}, ${track.title}, ${track.artist},
              ${videoId}, ${track.title}, ${track.artist},
              ${lyricsResult.lrclibId || null},
              ${lyricsResult.matchedTitle || null},
              ${lyricsResult.matchedArtist || null},
              ${lyricsResult.matchedAlbum || null},
              ${lyricsResult.matchedDuration || null},
              ${lyricsResult.hasSynced ? 1 : 0},
              ${lyricsResult.hasPlain ? 1 : 0},
              ${lyricsResult.isInstrumental ? 1 : 0},
              ${lyricsResult.confidence || 0},
              ${lyricsEval.status},
              ${lyricsEval.timestampsPresent ? 1 : 0},
              ${lyricsEval.verificationNotes || null},
              ${lyricsResult.error || null},
              ${Math.floor(Date.now() / 1000)}
            )
            ON CONFLICT(scan_id, video_id) DO UPDATE SET
              track_id = excluded.track_id,
              playlist_position = excluded.playlist_position,
              original_title = excluded.original_title,
              original_artist = excluded.original_artist,
              lrclib_id = excluded.lrclib_id,
              has_synced = excluded.has_synced,
              has_plain = excluded.has_plain,
              is_instrumental = excluded.is_instrumental,
              match_confidence = excluded.match_confidence,
              status = excluded.status,
              timestamps_present = excluded.timestamps_present,
              verification_notes = excluded.verification_notes,
              error_message = excluded.error_message,
              checked_at = excluded.checked_at
          `);
        } catch (lyricsErr) {
          const lyricsId = crypto.randomUUID();
          try {
            await db.query(sql`
              INSERT INTO lyrics_candidates (
                id, scan_id, track_id, playlist_position, original_title, original_artist,
                video_id, title, artist,
                status, error_message, checked_at
              ) VALUES (
                ${lyricsId}, ${scanId}, ${trackId}, ${position}, ${track.title}, ${track.artist},
                ${videoId}, ${track.title}, ${track.artist},
                'ERROR', ${lyricsErr.message},
                ${Math.floor(Date.now() / 1000)}
              )
              ON CONFLICT(scan_id, video_id) DO UPDATE SET
                track_id = excluded.track_id,
                playlist_position = excluded.playlist_position,
                original_title = excluded.original_title,
                original_artist = excluded.original_artist,
                status = 'ERROR',
                error_message = excluded.error_message,
                checked_at = excluded.checked_at
            `);
          } catch (_) {}
        }

        // Update progress
        await db.query(sql`
          UPDATE coverage_scans SET scanned_tracks = ${i + 1} WHERE id = ${scanId}
        `);

        if ((i + 1) % 10 === 0 || i === tracks.length - 1) {
          console.log(`[CoverageScanner] Progress: ${i + 1}/${tracks.length} tracks scanned`);
        }
      }

      // Mark scan complete
      await db.query(sql`
        UPDATE coverage_scans
        SET status = 'COMPLETED', scanned_tracks = ${tracks.length}, completed_at = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${scanId}
      `);

      console.log(`[CoverageScanner] Scan ${scanId} completed: ${tracks.length} tracks scanned`);
    } catch (fatalErr) {
      console.error(`[CoverageScanner] Fatal error during scan ${scanId}:`, fatalErr.message);
      await db.query(sql`
        UPDATE coverage_scans SET status = 'ERROR', error_message = ${fatalErr.message} WHERE id = ${scanId}
      `);
    } finally {
      this.activeScanAbortControllers.delete(scanId);
    }
  }

  /**
   * Search a provider with retry logic for transient network errors.
   */
  async _searchWithRetry(provider, query, retries = this.maxRetries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await provider.findCandidates(query, 'flac');
      } catch (err) {
        if (attempt === retries) throw err;
        const isTransient = err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' ||
          err.code === 'ENOTFOUND' || (err.response && err.response.status >= 500);
        if (!isTransient) throw err;
        console.warn(`[CoverageScanner] Retrying ${provider.name} (attempt ${attempt + 1}/${retries}): ${err.message}`);
        await this._delay(1000 * (attempt + 1));
      }
    }
    return [];
  }

  /**
   * Fetch lyrics status without persisting to lyrics_metadata.
   * This is a scan-only check; it does not write to the download system's lyrics DB.
   */
  async _fetchLyricsForCoverage(track) {
    const axios = require('axios');
    const baseUrl = 'https://lrclib.net/api';
    const userAgent = 'YT_PlaylistMerger/1.0 (https://github.com/nithish0302/YT_PLAYLISTMERGER)';

    function normalizeText(t) {
      if (!t) return '';
      return t.toLowerCase()
        .replace(/\s*[\(\[](official\s*(music\s*)?video|video|audio|lyrics?|lyric\s*video|hd|4k|remastered|visualizer)[\)\]]/gi, '')
        .replace(/\s*-\s*official\s*(music\s*)?video/gi, '')
        .replace(/\s*-\s*topic$/i, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function scoreSimilarity(a, b) {
      const nA = normalizeText(a), nB = normalizeText(b);
      if (!nA || !nB) return 0;
      if (nA === nB) return 1.0;
      if (nA.includes(nB) || nB.includes(nA)) return Math.max(0.75, Math.min(nA.length, nB.length) / Math.max(nA.length, nB.length));
      const sA = new Set(nA.split(' ').filter(Boolean)), sB = new Set(nB.split(' ').filter(Boolean));
      let m = 0; for (const x of sA) if (sB.has(x)) m++;
      const u = new Set([...sA, ...sB]).size;
      return u === 0 ? 0 : m / u;
    }

    const cleanedTitle = normalizeText(track.title);
    if (!cleanedTitle) return { status: 'UNAVAILABLE', confidence: 0 };

    let candidates = [];

    // Attempt 1: search API
    try {
      const cleanedArtist = normalizeText(track.artist);
      const params = { track_name: cleanedTitle };
      if (cleanedArtist && cleanedArtist !== 'unknown artist') params.artist_name = cleanedArtist;

      const res = await axios.get(`${baseUrl}/search`, {
        params,
        headers: { 'User-Agent': userAgent },
        timeout: 10000,
      });
      if (Array.isArray(res.data)) candidates = res.data;
    } catch (err) {
      if (err.response && (err.response.status === 429 || err.response.status === 503)) {
        const wait = parseInt(err.response.headers['retry-after'], 10) || 2;
        await this._delay(wait * 1000);
        // One retry
        try {
          const res2 = await axios.get(`${baseUrl}/search`, {
            params: { track_name: cleanedTitle },
            headers: { 'User-Agent': userAgent },
            timeout: 12000,
          });
          if (Array.isArray(res2.data)) candidates = res2.data;
        } catch (retryErr) {
          return { status: 'ERROR', error: retryErr.message, confidence: 0 };
        }
      } else {
        return { status: 'ERROR', error: err.message, confidence: 0 };
      }
    }

    if (candidates.length === 0) return { status: 'UNAVAILABLE', confidence: 0 };

    // Find best match
    let best = null, highestScore = 0;
    for (const c of candidates) {
      const tScore = scoreSimilarity(track.title, c.trackName || c.name);
      const aScore = track.artist ? scoreSimilarity(track.artist, c.artistName) : 0.5;
      let score = (tScore * 0.7) + (aScore * 0.3);
      if (track.duration && c.duration) {
        const diff = Math.abs(track.duration - c.duration);
        if (diff <= 3) score += 0.05;
        else if (diff > 15) score -= 0.15;
      }
      score = Math.min(1.0, Math.max(0.0, score));
      if (score > highestScore) { highestScore = score; best = c; }
    }

    if (!best || highestScore < 0.55) {
      return { status: 'UNAVAILABLE', confidence: highestScore };
    }

    const hasSynced = Boolean(best.syncedLyrics && best.syncedLyrics.trim());
    const hasPlain = Boolean(best.plainLyrics && best.plainLyrics.trim());
    const isInstrumental = Boolean(best.instrumental);

    let status = 'UNAVAILABLE';
    if (isInstrumental) status = 'INSTRUMENTAL';
    else if (hasSynced) status = 'SYNCHRONIZED';
    else if (hasPlain) status = 'PLAIN';

    if (highestScore < 0.82 && !isInstrumental) status = 'AMBIGUOUS';

    return {
      status,
      lrclibId: best.id,
      matchedTitle: best.trackName,
      matchedArtist: best.artistName,
      matchedAlbum: best.albumName || null,
      matchedDuration: best.duration || null,
      hasSynced,
      hasPlain,
      isInstrumental,
      confidence: Math.round(highestScore * 100) / 100,
    };
  }

  /**
   * Cancel a running scan.
   */
  cancelScan(scanId) {
    const ctrl = this.activeScanAbortControllers.get(scanId);
    if (ctrl) ctrl.aborted = true;
  }

  /**
   * Resume an interrupted scan from where it left off.
   */
  async resumeScan(scanId, tracks) {
    const db = getDB();
    const scanRows = await db.query(sql`SELECT * FROM coverage_scans WHERE id = ${scanId}`);
    const scan = scanRows[0];
    if (!scan) throw new Error('Scan not found');
    if (scan.status === 'COMPLETED') return scan;

    // Find which tracks have already been scanned (via lyrics_candidates as the last step per track)
    const scannedVideoIds = new Set();
    const existing = await db.query(sql`SELECT video_id FROM lyrics_candidates WHERE scan_id = ${scanId}`);
    existing.forEach(r => scannedVideoIds.add(r.video_id));

    const remaining = tracks.filter(t => !scannedVideoIds.has(t.videoId || t.video_id || ''));
    console.log(`[CoverageScanner] Resuming scan ${scanId}: ${remaining.length} tracks remaining out of ${tracks.length}`);

    if (remaining.length === 0) {
      await db.query(sql`
        UPDATE coverage_scans SET status = 'COMPLETED', scanned_tracks = ${tracks.length}, completed_at = ${Math.floor(Date.now() / 1000)}
        WHERE id = ${scanId}
      `);
      return;
    }

    // Rerun with remaining tracks
    await this.runScan(scanId, remaining);
  }

  /**
   * Get scan status and summary.
   */
  async getScan(scanId) {
    const db = getDB();
    const rows = await db.query(sql`SELECT * FROM coverage_scans WHERE id = ${scanId}`);
    return rows[0] || null;
  }

  /**
   * Get all scans.
   */
  async getAllScans() {
    const db = getDB();
    return db.query(sql`SELECT * FROM coverage_scans ORDER BY created_at DESC LIMIT 20`);
  }

  /**
   * Build comprehensive coverage report from scan data.
   */
  async buildCoverageReport(scanId) {
    const db = getDB();
    const scan = await this.getScan(scanId);
    if (!scan) throw new Error('Scan not found');

    // Get all audio candidates for this scan
    const audioCandidates = await db.query(sql`
      SELECT * FROM audio_candidates WHERE scan_id = ${scanId} ORDER BY video_id, match_score DESC
    `);

    // Get all lyrics candidates for this scan
    const lyricsCandidates = await db.query(sql`
      SELECT * FROM lyrics_candidates WHERE scan_id = ${scanId}
    `);

    // Build per-track analysis
    const trackMap = new Map(); // videoId -> { audio: [], lyrics: null, bestCandidate: null }

    for (const ac of audioCandidates) {
      if (!trackMap.has(ac.video_id)) {
        trackMap.set(ac.video_id, { videoId: ac.video_id, title: ac.title, artist: ac.artist, audio: [], lyrics: null, bestCandidate: null });
      }
      trackMap.get(ac.video_id).audio.push(ac);
    }

    for (const lc of lyricsCandidates) {
      if (!trackMap.has(lc.video_id)) {
        trackMap.set(lc.video_id, { videoId: lc.video_id, title: lc.title, artist: lc.artist, audio: [], lyrics: null, bestCandidate: null });
      }
      trackMap.get(lc.video_id).lyrics = lc;
    }

    // Compute coverage stats
    let tracksWithAudio = 0;
    let tracksWithNoAudio = 0;
    let tracksNeedingReview = 0;
    let tracksWithVerifiedSyncedLyrics = 0;
    let tracksWithSyncedLyricsNeedsReview = 0;
    let tracksWithSyncedLyrics = 0;
    let tracksWithPlainLyrics = 0;
    let tracksWithNoLyrics = 0;
    let tracksInstrumental = 0;
    let tracksAmbiguousLyrics = 0;
    let tracksLyricsError = 0;
    let tracksWithAudioAndSyncedLyrics = 0;
    let providerErrors = 0;

    const providerCoverage = { jamendo: 0, internet_archive: 0, ccmixter: 0 };
    const qualityDistribution = { LOSSLESS: 0, HIGH_BITRATE_LOSSY: 0, STANDARD_LOSSY: 0, UNKNOWN: 0 };
    const formatDistribution = {};

    const trackDetails = [];

    for (const [videoId, entry] of trackMap) {
      // Find overall best candidate across all providers
      const validCandidates = entry.audio.filter(c =>
        c.download_allowed && c.match_outcome !== 'PROVIDER_ERROR' && c.match_outcome !== 'NO_MATCH'
      );
      const highConfidence = validCandidates.filter(c => c.match_outcome === 'HIGH_CONFIDENCE');
      const needsReview = validCandidates.filter(c => c.match_outcome === 'NEEDS_REVIEW');
      const providerErrorCandidates = entry.audio.filter(c => c.match_outcome === 'PROVIDER_ERROR');

      providerErrors += providerErrorCandidates.length;

      let bestCandidate = null;
      if (highConfidence.length > 0) {
        bestCandidate = highConfidence.sort((a, b) => b.match_score - a.match_score)[0];
      } else if (needsReview.length > 0) {
        bestCandidate = needsReview.sort((a, b) => b.match_score - a.match_score)[0];
      }
      entry.bestCandidate = bestCandidate;

      // Count per-track audio status (deduplicated by track, not by candidate)
      const hasAuthorizedAudio = highConfidence.length > 0;
      const hasReviewAudio = needsReview.length > 0;

      if (hasAuthorizedAudio) {
        tracksWithAudio++;
      } else if (hasReviewAudio) {
        tracksNeedingReview++;
      } else {
        tracksWithNoAudio++;
      }

      // Count which providers contribute valid matches per track
      const trackProviders = new Set();
      for (const c of validCandidates) {
        trackProviders.add(c.provider);
      }
      for (const p of trackProviders) {
        if (providerCoverage[p] !== undefined) providerCoverage[p]++;
      }

      // Quality and format from best candidate
      if (bestCandidate) {
        const qt = bestCandidate.quality_tier || 'UNKNOWN';
        qualityDistribution[qt] = (qualityDistribution[qt] || 0) + 1;
        const fmt = bestCandidate.format || 'unknown';
        formatDistribution[fmt] = (formatDistribution[fmt] || 0) + 1;
      }

      // Lyrics
      const lc = entry.lyrics;
      let lyricsStatus = 'UNAVAILABLE';
      let verificationNotes = null;
      if (lc) {
        lyricsStatus = lc.status;
        verificationNotes = lc.verification_notes || null;
        if (lc.status === 'VERIFIED_SYNCHRONIZED') {
          tracksWithVerifiedSyncedLyrics++;
          tracksWithSyncedLyrics++;
        } else if (lc.status === 'SYNCHRONIZED_NEEDS_REVIEW' || lc.status === 'SYNCHRONIZED') {
          tracksWithSyncedLyricsNeedsReview++;
          tracksWithSyncedLyrics++;
        } else if (lc.status === 'PLAIN') tracksWithPlainLyrics++;
        else if (lc.status === 'INSTRUMENTAL') tracksInstrumental++;
        else if (lc.status === 'AMBIGUOUS') tracksAmbiguousLyrics++;
        else if (lc.status === 'ERROR') tracksLyricsError++;
        else tracksWithNoLyrics++;
      } else {
        tracksWithNoLyrics++;
      }

      // Both audio + synced lyrics
      if (hasAuthorizedAudio && lc && (lc.status === 'VERIFIED_SYNCHRONIZED' || lc.status === 'SYNCHRONIZED')) {
        tracksWithAudioAndSyncedLyrics++;
      }

      trackDetails.push({
        trackId: (entry.audio[0]?.track_id || lc?.track_id || `track_${videoId}`),
        position: (entry.audio[0]?.playlist_position !== undefined ? entry.audio[0]?.playlist_position : (lc?.playlist_position !== undefined ? lc?.playlist_position : null)),
        videoId,
        title: entry.title,
        artist: entry.artist,
        audioStatus: hasAuthorizedAudio ? 'AUTHORIZED' : (hasReviewAudio ? 'NEEDS_REVIEW' : 'UNAVAILABLE'),
        bestCandidate: bestCandidate ? {
          provider: bestCandidate.provider,
          candidateTitle: bestCandidate.candidate_title,
          candidateArtist: bestCandidate.candidate_artist,
          matchOutcome: bestCandidate.match_outcome,
          matchScore: bestCandidate.match_score,
          licenseName: bestCandidate.license_name,
          rightsStatus: bestCandidate.rights_status || 'UNSUPPORTED_CC_CLAIM',
          rightsJustification: bestCandidate.rights_justification || null,
          versionType: bestCandidate.version_type || 'STUDIO_ORIGINAL',
          downloadAllowed: Boolean(bestCandidate.download_allowed),
          format: bestCandidate.format,
          bitrate: bestCandidate.bitrate,
          qualityTier: bestCandidate.quality_tier,
          sourceUrl: bestCandidate.source_url,
          matchReasons: bestCandidate.match_reasons ? JSON.parse(bestCandidate.match_reasons) : [],
        } : null,
        rejectionReason: !bestCandidate
          ? (providerErrorCandidates.length === entry.audio.length && entry.audio.length > 0
            ? 'All provider lookups failed with errors'
            : 'No matching authorized audio found on any provider')
          : null,
        totalCandidates: validCandidates.length,
        lyricsStatus,
        verificationNotes,
        lyricsConfidence: lc ? lc.match_confidence : 0,
        userConfirmed: bestCandidate ? Boolean(bestCandidate.user_confirmed) : false,
      });
    }

    return {
      scanId,
      playlistId: scan.playlist_id,
      playlistTitle: scan.playlist_title,
      status: scan.status,
      scannedAt: scan.started_at ? new Date(scan.started_at * 1000).toISOString() : null,
      completedAt: scan.completed_at ? new Date(scan.completed_at * 1000).toISOString() : null,

      summary: {
        totalTracksScanned: trackMap.size,
        authorizedDownloadableMatches: tracksWithAudio,
        matchesRequiringReview: tracksNeedingReview,
        unavailableTracks: tracksWithNoAudio,
        synchronizedLyrics: tracksWithSyncedLyrics,
        verifiedSynchronizedLyrics: tracksWithVerifiedSyncedLyrics,
        synchronizedLyricsNeedsReview: tracksWithSyncedLyricsNeedsReview,
        plainLyricsOnly: tracksWithPlainLyrics,
        instrumental: tracksInstrumental,
        ambiguousLyrics: tracksAmbiguousLyrics,
        noLyrics: tracksWithNoLyrics,
        lyricsErrors: tracksLyricsError,
        audioAndSyncedLyrics: tracksWithAudioAndSyncedLyrics,
        providerErrors,
      },

      providerCoverage,
      qualityDistribution,
      formatDistribution,

      tracks: trackDetails,
    };
  }

  /**
   * Get track-level details for a scan.
   */
  async getTrackCandidates(scanId, videoId) {
    const db = getDB();
    const audio = await db.query(sql`
      SELECT * FROM audio_candidates WHERE scan_id = ${scanId} AND video_id = ${videoId} ORDER BY match_score DESC
    `);
    const lyrics = await db.query(sql`
      SELECT * FROM lyrics_candidates WHERE scan_id = ${scanId} AND video_id = ${videoId}
    `);
    return { audio, lyrics: lyrics[0] || null };
  }

  /**
   * Manually confirm a candidate as the user's choice.
   */
  async confirmCandidate(candidateId) {
    const db = getDB();
    await db.query(sql`UPDATE audio_candidates SET user_confirmed = 1 WHERE id = ${candidateId}`);
  }

  _delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

module.exports = new CoverageScannerService();
