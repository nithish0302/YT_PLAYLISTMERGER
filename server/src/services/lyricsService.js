const axios = require('axios');
const { getDB, sql } = require('../db');
const lyricsConfig = require('../config/lyricsConfig');

/**
 * Normalizes strings for title/artist matching.
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/\s*[\(\[](official\s*(music\s*)?video|video|audio|lyrics?|lyric\s*video|hd|4k|remastered|visualizer)[\)\]]/gi, '')
    .replace(/\s*-\s*official\s*(music\s*)?video/gi, '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes string similarity between 0.0 and 1.0.
 */
function scoreSimilarity(a, b) {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (!normA || !normB) return 0;
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) {
    return Math.max(0.75, Math.min(normA.length, normB.length) / Math.max(normA.length, normB.length));
  }
  const setA = new Set(normA.split(' ').filter(Boolean));
  const setB = new Set(normB.split(' ').filter(Boolean));
  let match = 0;
  for (const item of setA) {
    if (setB.has(item)) match++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : match / union;
}

class LyricsService {
  constructor() {
    this.baseUrl = 'https://lrclib.net/api';
    this.userAgent = 'YT_PlaylistMerger/1.0 (https://github.com/nithish0302/YT_PLAYLISTMERGER)';
    this.minRequestDelayMs = 350; // 200-500ms pacing
    this.lastRequestTimestamp = 0;
  }

  /**
   * Throttle requests to respect the 200-500ms rate limit and handle 429/503 Retry-After.
   */
  async _paceRequest() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTimestamp;
    if (elapsed < this.minRequestDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.minRequestDelayMs - elapsed));
    }
    this.lastRequestTimestamp = Date.now();
  }

  /**
   * Internal HTTP request with Retry-After support.
   */
  async _requestWithRetry(url, params = {}) {
    await this._paceRequest();

    try {
      return await axios.get(url, {
        params,
        headers: {
          'User-Agent': this.userAgent,
        },
        timeout: 10000,
      });
    } catch (err) {
      if (err.response && (err.response.status === 429 || err.response.status === 503)) {
        const retryAfterHeader = err.response.headers['retry-after'];
        let waitMs = 2000;
        if (retryAfterHeader) {
          const parsed = parseInt(retryAfterHeader, 10);
          if (!isNaN(parsed)) {
            waitMs = parsed * 1000;
          }
        }
        console.warn(`[LyricsService] HTTP ${err.response.status} from LRCLIB. Backing off for ${waitMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        // Retry once after backoff
        return await axios.get(url, {
          params,
          headers: { 'User-Agent': this.userAgent },
          timeout: 12000,
        });
      }
      throw err;
    }
  }

  /**
   * Fetch lyrics for a track, calculating confidence and checking for ambiguous matches.
   * @param {Object} track - { id, title, artist, album, duration }
   * @returns {Promise<Object>} Lyrics result object
   */
  async fetchLyricsForTrack(track) {
    const db = getDB();

    // 1. Check if we already have lyrics saved in lyrics_metadata for this track
    if (track.id) {
      const existing = await db.query(sql`
        SELECT * FROM lyrics_metadata WHERE track_id = ${track.id}
      `);
      if (existing.length > 0) {
        const row = existing[0];
        let status = 'UNAVAILABLE';
        if (row.instrumental) status = 'INSTRUMENTAL';
        else if (row.synced_lyrics) status = 'SYNCHRONIZED';
        else if (row.plain_lyrics) status = 'PLAIN';

        return {
          status,
          lrclibId: row.lrclib_id,
          syncedLyrics: row.synced_lyrics,
          plainLyrics: row.plain_lyrics,
          instrumental: Boolean(row.instrumental),
          matchConfidence: row.match_confidence,
          needsConfirmation: Boolean(row.needs_confirmation),
        };
      }
    }

    const cleanedTitle = normalizeText(track.title);
    const cleanedArtist = normalizeText(track.artist);

    if (!cleanedTitle) {
      return { status: 'UNAVAILABLE', reason: 'Missing title' };
    }

    let candidates = [];

    // Attempt 1: Direct LRCLIB get API if album & duration are known
    if (track.album && track.duration) {
      try {
        const res = await this._requestWithRetry(`${this.baseUrl}/get`, {
          track_name: track.title,
          artist_name: track.artist || '',
          album_name: track.album || '',
          duration: track.duration,
        });
        if (res.data && (res.data.syncedLyrics || res.data.plainLyrics || res.data.instrumental)) {
          candidates.push(res.data);
        }
      } catch (e) {
        // Not found via exact match is common, proceed to search
      }
    }

    // Attempt 2: Search API with track_name and artist_name
    if (candidates.length === 0) {
      try {
        const params = {
          track_name: cleanedTitle,
        };
        if (cleanedArtist && cleanedArtist !== 'unknown artist') {
          params.artist_name = cleanedArtist;
        }

        const res = await this._requestWithRetry(`${this.baseUrl}/search`, params);
        if (Array.isArray(res.data)) {
          candidates = res.data;
        }
      } catch (err) {
        console.warn(`[LyricsService] Search failed for "${track.title}":`, err.message);
      }
    }

    // Attempt 3: General query search if still nothing
    if (candidates.length === 0 && cleanedTitle) {
      try {
        const q = cleanedArtist && cleanedArtist !== 'unknown artist'
          ? `${cleanedTitle} ${cleanedArtist}`
          : cleanedTitle;

        const res = await this._requestWithRetry(`${this.baseUrl}/search`, { q });
        if (Array.isArray(res.data)) {
          candidates = res.data;
        }
      } catch (err) {
        console.warn(`[LyricsService] Fallback search failed for "${track.title}":`, err.message);
      }
    }

    if (candidates.length === 0) {
      // Mark lyrics unavailable in DB to avoid repeated calls
      if (track.id) {
        await this.saveLyricsRecord({
          trackId: track.id,
          lrclibId: null,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          instrumental: false,
          plainLyrics: null,
          syncedLyrics: null,
          matchConfidence: 0.0,
          needsConfirmation: false,
          confirmedByUser: false,
        });
      }
      return { status: 'UNAVAILABLE' };
    }

    // Evaluate candidates with confidence scoring
    let best = null;
    let highestScore = 0;

    for (const c of candidates) {
      const titleScore = scoreSimilarity(track.title, c.trackName || c.name);
      const artistScore = track.artist ? scoreSimilarity(track.artist, c.artistName) : 0.5;

      let score = (titleScore * 0.7) + (artistScore * 0.3);

      // Check version discrepancies (remix, cover, live, acoustic) per Task 2
      const candTitleLower = (c.trackName || c.name || '').toLowerCase();
      const trackTitleLower = (track.title || '').toLowerCase();
      for (const kw of lyricsConfig.DISCREPANCY_KEYWORDS) {
        if (candTitleLower.includes(kw) && !trackTitleLower.includes(kw)) {
          score -= 0.35;
          break;
        }
      }

      // Duration bonus/penalty if both durations are present
      if (track.duration && c.duration) {
        const diff = Math.abs(track.duration - c.duration);
        if (diff <= 3) score += 0.05;
        else if (diff > 15) score -= 0.15;
      }

      score = Math.min(1.0, Math.max(0.0, score));

      if (score > highestScore) {
        highestScore = score;
        best = c;
      }
    }

    const confidence = Math.round(highestScore * 100) / 100;

    // Confidence thresholds from lyricsConfig:
    // >= lyricsConfig.MIN_CONFIDENCE_VERIFIED (0.82): High confidence
    // < lyricsConfig.MIN_CONFIDENCE_ACCEPT (0.55): Low confidence (reject)
    if (!best || confidence < lyricsConfig.MIN_CONFIDENCE_ACCEPT) {
      if (track.id) {
        await this.saveLyricsRecord({
          trackId: track.id,
          lrclibId: null,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          instrumental: false,
          plainLyrics: null,
          syncedLyrics: null,
          matchConfidence: confidence,
          needsConfirmation: false,
          confirmedByUser: false,
        });
      }
      return { status: lyricsConfig.STATUS.UNAVAILABLE, matchConfidence: confidence };
    }

    const isInstrumental = Boolean(best.instrumental);
    const hasSynced = Boolean(best.syncedLyrics && best.syncedLyrics.trim());
    const hasPlain = Boolean(best.plainLyrics && best.plainLyrics.trim());

    // Duration verification thresholds centralized via lyricsConfig
    let needsConfirmation = confidence < lyricsConfig.MIN_CONFIDENCE_VERIFIED;
    if (hasSynced) {
      if (!track.duration || track.duration <= 0) {
        needsConfirmation = true;
      } else if (best.duration) {
        const durationDiff = Math.abs(track.duration - best.duration);
        if (durationDiff > lyricsConfig.DURATION_VERIFIED_TOLERANCE_SEC) {
          needsConfirmation = true; // includes 2-4s gap and >4s mismatch
        }
      } else {
        needsConfirmation = true;
      }
    }

    let status = lyricsConfig.STATUS.UNAVAILABLE;
    if (isInstrumental) status = lyricsConfig.STATUS.INSTRUMENTAL;
    else if (hasSynced) status = 'SYNCHRONIZED';
    else if (hasPlain) status = lyricsConfig.STATUS.PLAIN;

    const lyricsData = {
      trackId: track.id,
      lrclibId: best.id,
      title: best.trackName,
      artist: best.artistName,
      album: best.albumName || '',
      duration: best.duration || null,
      instrumental: isInstrumental,
      plainLyrics: best.plainLyrics || null,
      syncedLyrics: best.syncedLyrics || null,
      matchConfidence: confidence,
      needsConfirmation,
      confirmedByUser: false,
    };

    if (track.id) {
      await this.saveLyricsRecord(lyricsData);
    }

    return {
      status,
      ...lyricsData,
    };
  }

  /**
   * Save or update lyrics record in `lyrics_metadata`.
   */
  async saveLyricsRecord(data) {
    const db = getDB();
    const id = require('crypto').randomUUID();

    await db.query(sql`
      INSERT INTO lyrics_metadata (
        id, track_id, lrclib_id, title, artist, album, duration,
        instrumental, plain_lyrics, synced_lyrics, match_confidence,
        needs_confirmation, confirmed_by_user, created_at
      ) VALUES (
        ${id},
        ${data.trackId},
        ${data.lrclibId || null},
        ${data.title || null},
        ${data.artist || null},
        ${data.album || null},
        ${data.duration || null},
        ${data.instrumental ? 1 : 0},
        ${data.plainLyrics || null},
        ${data.syncedLyrics || null},
        ${data.matchConfidence || 0.0},
        ${data.needsConfirmation ? 1 : 0},
        ${data.confirmedByUser ? 1 : 0},
        ${Math.floor(Date.now() / 1000)}
      )
      ON CONFLICT(track_id) DO UPDATE SET
        lrclib_id          = excluded.lrclib_id,
        title              = excluded.title,
        artist             = excluded.artist,
        album              = excluded.album,
        duration           = excluded.duration,
        instrumental       = excluded.instrumental,
        plain_lyrics       = excluded.plain_lyrics,
        synced_lyrics      = excluded.synced_lyrics,
        match_confidence   = excluded.match_confidence,
        needs_confirmation = excluded.needs_confirmation,
        confirmed_by_user  = excluded.confirmed_by_user
    `);
  }

  /**
   * Confirm or reject lyrics match manually by the user.
   */
  async confirmLyricsMatch(trackId, confirmed = true) {
    const db = getDB();
    if (confirmed) {
      await db.query(sql`
        UPDATE lyrics_metadata
        SET needs_confirmation = 0, confirmed_by_user = 1
        WHERE track_id = ${trackId}
      `);
      // Update track status: User confirmation sets USER_CONFIRMED_MATCH, maintaining
      // strict separation from VERIFIED_SYNCHRONIZED per Phase 5.1 specification
      await db.query(sql`
        UPDATE download_tracks
        SET lyrics_status = (
          CASE
            WHEN (SELECT synced_lyrics FROM lyrics_metadata WHERE track_id = ${trackId}) IS NOT NULL THEN 'USER_CONFIRMED_MATCH'
            WHEN (SELECT plain_lyrics FROM lyrics_metadata WHERE track_id = ${trackId}) IS NOT NULL THEN 'PLAIN'
            ELSE 'INSTRUMENTAL'
          END
        )
        WHERE id = ${trackId}
      `);
    } else {
      // User rejected the ambiguous match
      await db.query(sql`
        UPDATE lyrics_metadata
        SET plain_lyrics = NULL, synced_lyrics = NULL, needs_confirmation = 0, confirmed_by_user = 0
        WHERE track_id = ${trackId}
      `);
      await db.query(sql`
        UPDATE download_tracks
        SET lyrics_status = 'UNAVAILABLE'
        WHERE id = ${trackId}
      `);
    }
  }
}

module.exports = new LyricsService();
