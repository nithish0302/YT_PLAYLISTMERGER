const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { validateExternalUrl } = require('../utils/securityUtils');

class ArtworkService {
  /**
   * Validate image buffer format by inspecting magic bytes.
   * Returns { valid: boolean, mimeType: string, width?: number, height?: number, error?: string }
   */
  validateImageBuffer(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 16) {
      return { valid: false, error: 'Invalid or empty image buffer' };
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      const dimensions = this._extractJpegDimensions(buffer);
      return {
        valid: true,
        mimeType: 'image/jpeg',
        format: 'JPEG',
        width: dimensions.width,
        height: dimensions.height,
        size: buffer.length,
      };
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
      buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    ) {
      // In PNG, IHDR starts at byte 12; width is at 16-19, height is at 20-23 (big endian)
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return {
        valid: true,
        mimeType: 'image/png',
        format: 'PNG',
        width,
        height,
        size: buffer.length,
      };
    }

    // WebP: RIFF ... WEBP
    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return {
        valid: true,
        mimeType: 'image/webp',
        format: 'WebP',
        width: 500, // standard default
        height: 500,
        size: buffer.length,
      };
    }

    return { valid: false, error: 'Unsupported image format. Only JPEG, PNG, and WebP are permitted.' };
  }

  /**
   * Extract width and height from JPEG SOF markers.
   */
  _extractJpegDimensions(buffer) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      offset += 2;

      // SOF0 (0xC0) or SOF2 (0xC2) markers contain dimensions
      if (marker === 0xc0 || marker === 0xc2) {
        const height = buffer.readUInt16BE(offset + 3);
        const width = buffer.readUInt16BE(offset + 5);
        return { width, height };
      }

      // Variable-length marker: length is 2 bytes big-endian
      if (offset + 2 <= buffer.length) {
        const length = buffer.readUInt16BE(offset);
        offset += length;
      } else {
        break;
      }
    }
    return { width: 500, height: 500 }; // fallback
  }

  /**
   * Save artwork to a directory as cover.jpg or cover.png.
   */
  saveArtwork(targetDir, imageBuffer, mimeType = 'image/jpeg') {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const filePath = path.join(targetDir, `cover.${ext}`);
    fs.writeFileSync(filePath, imageBuffer);
    return filePath;
  }

  /**
   * Download and validate artwork from a permitted URL.
   * Only permits official provider domains or user uploads.
   */
  async fetchPermittedArtwork(url, expectedArtist = '') {
    if (!url || typeof url !== 'string') return null;

    // Validate protocol and reject private/localhost SSRF destinations
    try {
      validateExternalUrl(url);
    } catch (ssrfErr) {
      console.warn(`[ArtworkService] SSRF check blocked artwork URL: ${ssrfErr.message}`);
      return null;
    }

    // Check permitted public domains
    const permittedDomains = [
      'usercontent.jamendo.com',
      'archive.org',
      'ia60', 'ia80', 'ia90',
      'i.ytimg.com',
    ];

    const isPermitted = permittedDomains.some(d => url.includes(d));
    if (!isPermitted) {
      console.warn(`[ArtworkService] Artwork source domain rejected: ${url}`);
      return null;
    }

    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        maxContentLength: 10 * 1024 * 1024, // 10MB limit
        headers: { 'User-Agent': 'YT_PlaylistMerger/1.0' },
      });

      const buffer = Buffer.from(res.data);
      const validation = this.validateImageBuffer(buffer);
      if (!validation.valid) {
        console.warn(`[ArtworkService] Invalid image downloaded from ${url}:`, validation.error);
        return null;
      }

      return {
        buffer,
        mimeType: validation.mimeType,
        width: validation.width,
        height: validation.height,
        format: validation.format,
      };
    } catch (err) {
      console.warn(`[ArtworkService] Could not fetch artwork from ${url}:`, err.message);
      return null;
    }
  }

  /**
   * Create a standard valid test cover image buffer (100% decodable baseline JPEG).
   */
  createTestJpegBuffer() {
    return Buffer.from(
      'ffd8ffe000104a46494600010200000100010000fffe00104c61766336302e33312e31303200ffdb0043000804040404040505050505050606060606060606060606060607070708080807070706060707080808080909090808080809090a0a0a0c0c0b0b0e0e0e111114ffc4004d000101000000000000000000000000000000060101010100000000000000000000000000000607100100000000000000000000000000000000110100000000000000000000000000000000ffc00011080064006403012200021100031100ffda000c03010002110311003f008b0128dfc0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001fffd9',
      'hex'
    );
  }
}

module.exports = new ArtworkService();
