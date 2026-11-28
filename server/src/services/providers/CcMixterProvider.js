const axios = require('axios');
const AudioProvider = require('./AudioProvider');
const { normalizeString, evaluateMatch } = require('../matchingEngine');

class CcMixterProvider extends AudioProvider {
  constructor() {
    super('ccmixter');
    this.apiUrl = 'https://ccmixter.org/api/query';
  }

  /**
   * Checks whether a license URL represents a valid Creative Commons license.
   */
  hasPermittedLicense(licenseUrl) {
    return Boolean(licenseUrl && licenseUrl.includes('creativecommons.org'));
  }

  /**
   * Search ccMixter for licensed tracks matching query.
   * Returns common normalized candidate format.
   */
  async searchTracks({ title, artist, limit = 10, preferredFormat = 'flac' }) {
    const cleanedTitle = normalizeString(title);
    if (!cleanedTitle) return [];

    try {
      const cleanedArtist = normalizeString(artist);
      const searchTerms = cleanedArtist && cleanedArtist !== 'unknown artist'
        ? `${cleanedTitle} ${cleanedArtist}`
        : cleanedTitle;

      const response = await axios.get(this.apiUrl, {
        params: {
          f: 'json',
          search: searchTerms,
          limit: Math.min(limit, 15),
          sort: 'rank',
        },
        timeout: 10000,
      });

      if (!Array.isArray(response.data)) {
        return [];
      }

      const candidates = [];

      for (const item of response.data) {
        if (!item.files || !Array.isArray(item.files) || item.files.length === 0) {
          continue;
        }

        // Validate license: must be a documented Creative Commons license
        const licenseUrl = item.license_url || null;
        const licenseName = item.license_name || null;

        if (!licenseUrl || !licenseUrl.includes('creativecommons.org')) {
          // Reject items with missing or unclear license records
          continue;
        }

        // Locate best audio file
        const audioFiles = item.files.filter((f) => {
          const url = (f.download_url || '').toLowerCase();
          const name = (f.file_name || '').toLowerCase();
          return (
            url.endsWith('.flac') ||
            url.endsWith('.mp3') ||
            name.endsWith('.flac') ||
            name.endsWith('.mp3')
          );
        });

        if (audioFiles.length === 0) continue;

        // Prefer FLAC if requested & available, else MP3
        audioFiles.sort((a, b) => {
          const aIsFlac = (a.download_url || a.file_name || '').toLowerCase().endsWith('.flac');
          const bIsFlac = (b.download_url || b.file_name || '').toLowerCase().endsWith('.flac');
          if (aIsFlac && !bIsFlac) return -1;
          if (bIsFlac && !aIsFlac) return 1;
          return 0;
        });

        const selectedFile = audioFiles[0];
        const isFlac = (selectedFile.download_url || selectedFile.file_name || '').toLowerCase().endsWith('.flac');
        const artistName = item.user_real_name || item.user_name || 'ccMixter Artist';
        const attribution = `Music by ${artistName} (ccMixter, license: ${licenseName || 'CC'})`;

        candidates.push({
          provider: 'ccmixter',
          providerTrackId: String(item.upload_id),
          title: item.upload_name || cleanedTitle,
          artist: artistName,
          album: null,
          duration: null,
          sourceUrl: item.file_page_url || `https://ccmixter.org/files/${item.user_name}/${item.upload_id}`,
          downloadUrl: selectedFile.download_url || null,
          licenseName: licenseName || 'Creative Commons',
          licenseUrl,
          attribution,
          downloadAllowed: Boolean(selectedFile.download_url),
          format: isFlac ? 'flac' : 'mp3',
          bitrate: isFlac ? null : 320000,
        });
      }

      return candidates;
    } catch (err) {
      console.error('[ccMixter] searchTracks error:', err.message);
      return [];
    }
  }

  /**
   * Find candidates and evaluate matches using matchingEngine.
   * Any ccMixter remix or derivative will automatically be categorized as NEEDS_REVIEW.
   */
  async findCandidates(query, preferredFormat = 'flac') {
    const candidates = await this.searchTracks({
      title: query.title,
      artist: query.artist,
      limit: 10,
      preferredFormat,
    });

    return candidates.map((candidate) => {
      const evaluation = evaluateMatch(query, candidate);

      // RULE: Never substitute remixes/covers without explicit user confirmation
      let outcome = evaluation.outcome;
      if (outcome === 'HIGH_CONFIDENCE') {
        outcome = 'NEEDS_REVIEW'; // ccMixter is a remix/collaboration community; always flag for review
      }

      return {
        ...candidate,
        matchOutcome: outcome,
        matchScore: evaluation.score,
        matchReasons: evaluation.reasons,
        versionDiscrepancies: evaluation.versionDiscrepancies,
      };
    });
  }

  /**
   * Find the best authorized match.
   */
  async findBestMatch(query) {
    const candidates = await this.findCandidates(query, 'flac');
    const valid = candidates.filter(
      (c) => c.downloadAllowed && c.downloadUrl && c.matchOutcome !== 'NO_MATCH'
    );

    if (valid.length === 0) return null;

    valid.sort((a, b) => b.matchScore - a.matchScore);
    return valid[0];
  }

  /**
   * Get download info for a specific ccMixter upload.
   */
  async getDownloadInfo(providerTrackId) {
    const response = await axios.get(this.apiUrl, {
      params: {
        f: 'json',
        ids: providerTrackId,
      },
      timeout: 10000,
    });

    const item = response.data?.[0];
    if (!item) {
      throw new Error(`ccMixter track ${providerTrackId} not found.`);
    }

    const files = item.files || [];
    const audioFiles = files.filter((f) => {
      const url = (f.download_url || '').toLowerCase();
      return url.endsWith('.flac') || url.endsWith('.mp3');
    });

    if (audioFiles.length === 0 || !audioFiles[0].download_url) {
      throw new Error(`Track ${providerTrackId} has no authorized download audio file.`);
    }

    const selectedFile = audioFiles[0];
    const isFlac = (selectedFile.download_url || '').toLowerCase().endsWith('.flac');
    const artistName = item.user_real_name || item.user_name || 'ccMixter Artist';

    return {
      provider: 'ccmixter',
      providerTrackId: String(item.upload_id),
      title: item.upload_name,
      artist: artistName,
      album: null,
      duration: null,
      sourceUrl: item.file_page_url || `https://ccmixter.org/files/${item.user_name}/${item.upload_id}`,
      downloadUrl: selectedFile.download_url,
      licenseName: item.license_name || 'Creative Commons',
      licenseUrl: item.license_url || null,
      attribution: `Music by ${artistName} (ccMixter, license: ${item.license_name})`,
      downloadAllowed: true,
      format: isFlac ? 'flac' : 'mp3',
      bitrate: isFlac ? null : 320000,
    };
  }
}

module.exports = CcMixterProvider;
