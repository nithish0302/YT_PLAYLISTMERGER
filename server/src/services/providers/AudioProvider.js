/**
 * Abstract Base Class for Audio Providers
 */
class AudioProvider {
  constructor(name) {
    if (new.target === AudioProvider) {
      throw new TypeError('Cannot construct AudioProvider instances directly.');
    }
    this.name = name;
  }

  /**
   * Search for authorized tracks matching title and artist.
   * @param {Object} query - { title, artist, album, duration }
   * @returns {Promise<Array<Object>>} Matching candidates
   */
  async searchTracks(_query) {
    throw new Error('searchTracks() must be implemented by subclass.');
  }

  /**
   * Find the best authorized match for a track.
   * @param {Object} query - { title, artist, album, duration }
   * @returns {Promise<Object|null>} Best match or null
   */
  async findBestMatch(_query) {
    throw new Error('findBestMatch() must be implemented by subclass.');
  }

  /**
   * Get direct download stream/URL and format metadata.
   * @param {string} sourceTrackId
   * @param {string} [preferredFormat='flac']
   * @returns {Promise<Object>} { downloadUrl, format, license, trackId, allowed }
   */
  async getDownloadInfo(_sourceTrackId, _preferredFormat) {
    throw new Error('getDownloadInfo() must be implemented by subclass.');
  }
}

module.exports = AudioProvider;
