const mm = require('music-metadata');
const fs = require('fs');

class AudioMetadataService {
  /**
   * Inspect real metadata from a local audio file on disk.
   * Never fabricates quality or codec.
   * @param {string} filePath
   * @returns {Promise<Object>} { verified: boolean, format, actualBitrate, sampleRate, duration, channels, error }
   */
  async inspectAudioFile(filePath) {
    if (!fs.existsSync(filePath)) {
      return {
        verified: false,
        error: `File does not exist: ${filePath}`,
      };
    }

    try {
      const metadata = await mm.parseFile(filePath, { duration: true });
      const format = metadata.format;

      const duration = Math.round(format.duration || 0);
      const actualBitrate = format.bitrate ? Math.round(format.bitrate) : null;
      const sampleRate = format.sampleRate || null;
      const channels = format.numberOfChannels || null;
      const codec = (format.codec || format.container || '').toLowerCase();

      // Normalize audio format extension representation
      let audioFormat = 'unknown';
      if (codec.includes('flac')) audioFormat = 'flac';
      else if (codec.includes('mpeg') || codec.includes('mp3')) audioFormat = 'mp3';
      else if (codec.includes('ogg') || codec.includes('vorbis')) audioFormat = 'ogg';
      else if (codec.includes('aac') || codec.includes('m4a')) audioFormat = 'm4a';
      else if (codec.includes('wav')) audioFormat = 'wav';
      else if (codec) audioFormat = codec;

      return {
        verified: duration > 0,
        audioFormat,
        actualBitrate,
        sampleRate,
        duration,
        channels,
        codec,
      };
    } catch (err) {
      console.warn(`[AudioMetadataService] Could not parse audio file at ${filePath}:`, err.message);
      return {
        verified: false,
        error: `Audio parsing failed: ${err.message}`,
      };
    }
  }
}

module.exports = new AudioMetadataService();
