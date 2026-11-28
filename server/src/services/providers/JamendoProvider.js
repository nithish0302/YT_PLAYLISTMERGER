const axios = require('axios');
const AudioProvider = require('./AudioProvider');
const { normalizeString, evaluateMatch } = require('../matchingEngine');

class JamendoProvider extends AudioProvider {
  constructor() {
    super('jamendo');
    this.baseUrl = 'https://api.jamendo.com/v3.0';
  }

  getClientId() {
    return process.env.JAMENDO_CLIENT_ID || '';
  }

  /**
   * Search for tracks on Jamendo by title and optional artist.
   * Returns common normalized candidate format.
   */
  async searchTracks({ title, artist, limit = 10, preferredFormat = 'flac' }) {
    const clientId = this.getClientId();
    if (!clientId) {
      console.warn('[Jamendo] JAMENDO_CLIENT_ID environment variable is not configured.');
      return [];
    }

    const cleanedTitle = normalizeString(title);
    if (!cleanedTitle) return [];

    try {
      const params = {
        client_id: clientId,
        format: 'json',
        namesearch: cleanedTitle,
        audioformat: preferredFormat === 'flac' ? 'flac' : 'mp32',
        limit: Math.min(limit, 20),
        include: 'musicinfo+licenses',
      };

      const cleanedArtist = normalizeString(artist);
      if (cleanedArtist && cleanedArtist !== 'unknown artist') {
        params.artist_name = cleanedArtist;
      }

      const response = await axios.get(`${this.baseUrl}/tracks/`, {
        params,
        timeout: 10000,
      });

      if (!response.data || !Array.isArray(response.data.results)) {
        return [];
      }

      return response.data.results.map((item) => ({
        provider: 'jamendo',
        providerTrackId: String(item.id),
        title: item.name,
        artist: item.artist_name,
        album: item.album_name || null,
        duration: item.duration || null,
        sourceUrl: item.shareurl || null,
        downloadUrl: item.audiodownload_allowed ? item.audiodownload || null : null,
        licenseName: item.license_ccurl ? 'Creative Commons' : 'Jamendo Standard',
        licenseUrl: item.license_ccurl || null,
        attribution: item.artist_name ? `Music by ${item.artist_name} (via Jamendo)` : null,
        downloadAllowed: Boolean(item.audiodownload_allowed),
        format: preferredFormat === 'flac' ? 'flac' : 'mp3',
        bitrate: preferredFormat === 'flac' ? null : 320000,
      }));
    } catch (err) {
      console.error('[Jamendo] searchTracks error:', err.message);
      return [];
    }
  }

  /**
   * Find candidates and evaluate matches using matchingEngine.
   */
  async findCandidates(query, preferredFormat = 'flac') {
    let candidates = await this.searchTracks({
      title: query.title,
      artist: query.artist,
      limit: 15,
      preferredFormat,
    });

    if (candidates.length === 0) {
      candidates = await this.searchTracks({
        title: query.title,
        artist: null,
        limit: 15,
        preferredFormat,
      });
    }

    return candidates.map((candidate) => {
      const evaluation = evaluateMatch(query, candidate);
      return {
        ...candidate,
        matchOutcome: evaluation.outcome, // 'HIGH_CONFIDENCE' | 'NEEDS_REVIEW' | 'NO_MATCH'
        matchScore: evaluation.score,
        matchReasons: evaluation.reasons,
        versionDiscrepancies: evaluation.versionDiscrepancies,
      };
    });
  }

  /**
   * Find the best authorized match for a given track.
   */
  async findBestMatch(query) {
    const candidates = await this.findCandidates(query, 'flac');
    // Filter to candidates with download allowed and not NO_MATCH
    const valid = candidates.filter(
      (c) => c.downloadAllowed && c.downloadUrl && c.matchOutcome !== 'NO_MATCH'
    );

    if (valid.length === 0) {
      return null;
    }

    // Prefer HIGH_CONFIDENCE first, then highest score
    valid.sort((a, b) => {
      if (a.matchOutcome === 'HIGH_CONFIDENCE' && b.matchOutcome !== 'HIGH_CONFIDENCE') return -1;
      if (b.matchOutcome === 'HIGH_CONFIDENCE' && a.matchOutcome !== 'HIGH_CONFIDENCE') return 1;
      return b.matchScore - a.matchScore;
    });

    return valid[0];
  }

  /**
   * Get fresh download information for a specific Jamendo track.
   */
  async getDownloadInfo(providerTrackId, preferredFormat = 'flac') {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error('JAMENDO_CLIENT_ID is not configured.');
    }

    const requestedFormat = preferredFormat === 'flac' ? 'flac' : 'mp32';

    const response = await axios.get(`${this.baseUrl}/tracks/`, {
      params: {
        client_id: clientId,
        format: 'json',
        id: providerTrackId,
        audioformat: requestedFormat,
        include: 'musicinfo+licenses',
      },
      timeout: 10000,
    });

    const track = response.data?.results?.[0];
    if (!track) {
      throw new Error(`Jamendo track ${providerTrackId} not found.`);
    }

    if (!track.audiodownload_allowed) {
      throw new Error(`Track ${providerTrackId} does not permit audio download (audiodownload_allowed=false).`);
    }

    if (!track.audiodownload) {
      throw new Error(`Track ${providerTrackId} does not provide an authorized download URL.`);
    }

    return {
      provider: 'jamendo',
      providerTrackId: String(track.id),
      title: track.name,
      artist: track.artist_name,
      album: track.album_name || null,
      duration: track.duration || null,
      sourceUrl: track.shareurl || null,
      downloadUrl: track.audiodownload,
      licenseName: track.license_ccurl ? 'Creative Commons' : 'Jamendo Standard',
      licenseUrl: track.license_ccurl || null,
      attribution: track.artist_name ? `Music by ${track.artist_name} (via Jamendo)` : null,
      downloadAllowed: true,
      format: requestedFormat === 'flac' ? 'flac' : 'mp3',
      bitrate: requestedFormat === 'flac' ? null : 320000,
    };
  }
}

module.exports = JamendoProvider;
