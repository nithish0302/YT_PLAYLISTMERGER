const axios = require('axios');
const AudioProvider = require('./AudioProvider');
const { normalizeString, evaluateMatch } = require('../matchingEngine');

class InternetArchiveProvider extends AudioProvider {
  constructor() {
    super('internet_archive');
    this.searchUrl = 'https://archive.org/advancedsearch.php';
    this.metadataUrl = 'https://archive.org/metadata';
  }

  /**
   * Checks whether the metadata contains a permitted Creative Commons or Public Domain rights statement.
   */
  hasPermittedLicense(metadata) {
    if (!metadata) return false;
    const isAccessRestricted = Boolean(
      metadata.access_restricted ||
      metadata['access-restricted-item'] ||
      metadata.is_restricted ||
      metadata.access_restricted_item === 'true'
    );
    if (isAccessRestricted) return false;

    const licenseUrl = metadata.licenseurl || null;
    const rights = metadata.rights || null;
    return Boolean(
      (licenseUrl && licenseUrl.includes('creativecommons.org')) ||
      (rights && (rights.toLowerCase().includes('public domain') || rights.toLowerCase().includes('creative commons')))
    );
  }

  /**
   * Filters and selects the best audio file from an item's file list.
   * Prefers FLAC, followed by highest bitrate MP3/Vorbis.
   */
  selectBestAudioFile(files) {
    if (!Array.isArray(files) || files.length === 0) return null;
    const audioFiles = files.filter((f) => {
      const format = (f.format || '').toLowerCase();
      const name = (f.name || '').toLowerCase();
      return (
        format.includes('flac') ||
        format.includes('vbr mp3') ||
        format.includes('mp3') ||
        format.includes('ogg vorbis') ||
        name.endsWith('.flac') ||
        name.endsWith('.mp3') ||
        name.endsWith('.ogg')
      );
    });

    if (audioFiles.length === 0) return null;

    audioFiles.sort((a, b) => {
      const aIsFlac = (a.format || '').toLowerCase().includes('flac') || a.name.endsWith('.flac');
      const bIsFlac = (b.format || '').toLowerCase().includes('flac') || b.name.endsWith('.flac');
      if (aIsFlac && !bIsFlac) return -1;
      if (bIsFlac && !aIsFlac) return 1;

      const aBitrate = parseInt(a.bitrate, 10) || 0;
      const bBitrate = parseInt(b.bitrate, 10) || 0;
      return bBitrate - aBitrate;
    });

    return audioFiles[0];
  }

  /**
   * Search Internet Archive for authorized audio tracks.
   * Returns common normalized candidate format.
   */
  async searchTracks({ title, artist, limit = 10, preferredFormat = 'flac' }) {
    const cleanedTitle = normalizeString(title);
    if (!cleanedTitle) return [];

    try {
      // Build advanced search query for audio media
      let query = `mediatype:(audio) AND title:("${cleanedTitle.replace(/"/g, '')}")`;
      const cleanedArtist = normalizeString(artist);
      if (cleanedArtist && cleanedArtist !== 'unknown artist') {
        query += ` AND (creator:("${cleanedArtist.replace(/"/g, '')}") OR "${cleanedArtist.replace(/"/g, '')}")`;
      }

      const searchRes = await axios.get(this.searchUrl, {
        params: {
          q: query,
          fl: ['identifier,title,creator,mediatype,licenseurl,rights,publicdate,downloads'],
          rows: Math.min(limit, 15),
          output: 'json',
        },
        timeout: 10000,
      });

      const docs = searchRes.data?.response?.docs || [];
      if (!Array.isArray(docs) || docs.length === 0) {
        return [];
      }

      const candidates = [];

      // Retrieve metadata for items to inspect permitted files and rights
      for (const doc of docs) {
        const identifier = doc.identifier;
        if (!identifier) continue;

        try {
          const metaRes = await axios.get(`${this.metadataUrl}/${identifier}`, { timeout: 8000 });
          const metadata = metaRes.data?.metadata || {};
          const files = metaRes.data?.files || [];

          // 1. Inspect rights & license
          const licenseUrl = metadata.licenseurl || doc.licenseurl || null;
          const rights = metadata.rights || doc.rights || null;

          // RULE: Reject items with missing or unclear rights information
          // Do not treat mere presence of audio as authorization
          const isAccessRestricted = Boolean(
            metadata.access_restricted ||
            metadata['access-restricted-item'] ||
            metadata.is_restricted
          );

          if (isAccessRestricted) {
            continue; // Skip restricted items
          }

          const hasClearLicense = Boolean(
            (licenseUrl && licenseUrl.includes('creativecommons.org')) ||
            (rights && (rights.toLowerCase().includes('public domain') || rights.toLowerCase().includes('creative commons')))
          );

          if (!hasClearLicense && !licenseUrl) {
            // Unclear or missing rights: reject automatically per requirement
            continue;
          }

          // 2. Locate audio files and select best quality
          const audioFiles = files.filter((f) => {
            const format = (f.format || '').toLowerCase();
            const name = (f.name || '').toLowerCase();
            return (
              format.includes('flac') ||
              format.includes('vbr mp3') ||
              format.includes('mp3') ||
              format.includes('ogg vorbis') ||
              name.endsWith('.flac') ||
              name.endsWith('.mp3') ||
              name.endsWith('.ogg')
            );
          });

          if (audioFiles.length === 0) continue;

          // Prefer FLAC if available, otherwise highest bitrate MP3
          audioFiles.sort((a, b) => {
            const aIsFlac = (a.format || '').toLowerCase().includes('flac') || a.name.endsWith('.flac');
            const bIsFlac = (b.format || '').toLowerCase().includes('flac') || b.name.endsWith('.flac');
            if (aIsFlac && !bIsFlac) return -1;
            if (bIsFlac && !aIsFlac) return 1;

            const aBitrate = parseInt(a.bitrate, 10) || 0;
            const bBitrate = parseInt(b.bitrate, 10) || 0;
            return bBitrate - aBitrate;
          });

          const selectedFile = audioFiles[0];
          const fileName = selectedFile.name;
          const downloadUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(fileName)}`;
          const sourceUrl = `https://archive.org/details/${identifier}`;

          const isFlac = (selectedFile.format || '').toLowerCase().includes('flac') || fileName.endsWith('.flac');
          const format = isFlac ? 'flac' : 'mp3';
          const bitrate = selectedFile.bitrate ? parseInt(selectedFile.bitrate, 10) * 1000 : null;

          let duration = null;
          if (selectedFile.length) {
            // Convert "MM:SS" or numeric seconds
            const parts = String(selectedFile.length).split(':');
            if (parts.length === 2) {
              duration = parseInt(parts[0], 10) * 60 + parseFloat(parts[1]);
            } else if (parts.length === 3) {
              duration = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
            } else {
              duration = parseFloat(selectedFile.length);
            }
          }

          candidates.push({
            provider: 'internet_archive',
            providerTrackId: `${identifier}:${fileName}`,
            title: metadata.title || doc.title || cleanedTitle,
            artist: metadata.creator || doc.creator || artist || 'Internet Archive Contributor',
            album: metadata.album || null,
            duration: duration ? Math.round(duration) : null,
            sourceUrl,
            downloadUrl,
            licenseName: rights || (licenseUrl ? 'Creative Commons' : 'Internet Archive Rights-Verified'),
            licenseUrl: licenseUrl || null,
            attribution: `Audio from Internet Archive (${identifier})`,
            downloadAllowed: true,
            format,
            bitrate,
          });
        } catch (itemErr) {
          console.warn(`[InternetArchive] Error inspecting item ${identifier}:`, itemErr.message);
        }
      }

      return candidates;
    } catch (err) {
      console.error('[InternetArchive] searchTracks error:', err.message);
      return [];
    }
  }

  /**
   * Find candidates and evaluate matches using matchingEngine.
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
      return {
        ...candidate,
        matchOutcome: evaluation.outcome,
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
    const evaluated = await this.findCandidates(query, 'flac');
    const valid = evaluated.filter(
      (c) => c.downloadAllowed && c.downloadUrl && c.matchOutcome !== 'NO_MATCH'
    );

    if (valid.length === 0) return null;

    valid.sort((a, b) => {
      if (a.matchOutcome === 'HIGH_CONFIDENCE' && b.matchOutcome !== 'HIGH_CONFIDENCE') return -1;
      if (b.matchOutcome === 'HIGH_CONFIDENCE' && a.matchOutcome !== 'HIGH_CONFIDENCE') return 1;
      return b.matchScore - a.matchScore;
    });

    return valid[0];
  }

  /**
   * Get download info for a specific Internet Archive file.
   */
  async getDownloadInfo(providerTrackId) {
    const [identifier, fileName] = providerTrackId.split(':');
    if (!identifier || !fileName) {
      throw new Error(`Invalid Internet Archive track ID format: ${providerTrackId}`);
    }

    const metaRes = await axios.get(`${this.metadataUrl}/${identifier}`, { timeout: 10000 });
    const metadata = metaRes.data?.metadata || {};
    const files = metaRes.data?.files || [];

    const file = files.find((f) => f.name === fileName);
    if (!file) {
      throw new Error(`File "${fileName}" not found in Internet Archive item "${identifier}".`);
    }

    const downloadUrl = `https://archive.org/download/${identifier}/${encodeURIComponent(fileName)}`;
    const isFlac = (file.format || '').toLowerCase().includes('flac') || fileName.endsWith('.flac');

    return {
      provider: 'internet_archive',
      providerTrackId,
      title: metadata.title || fileName,
      artist: metadata.creator || 'Internet Archive Contributor',
      album: metadata.album || null,
      duration: file.length ? Math.round(parseFloat(file.length)) : null,
      sourceUrl: `https://archive.org/details/${identifier}`,
      downloadUrl,
      licenseName: metadata.rights || metadata.licenseurl || 'Creative Commons / Verified Rights',
      licenseUrl: metadata.licenseurl || null,
      attribution: `Audio from Internet Archive (${identifier})`,
      downloadAllowed: true,
      format: isFlac ? 'flac' : 'mp3',
      bitrate: file.bitrate ? parseInt(file.bitrate, 10) * 1000 : null,
    };
  }
}

module.exports = InternetArchiveProvider;
