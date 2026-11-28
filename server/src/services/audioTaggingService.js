const fs = require('fs');
const path = require('path');
const mm = require('music-metadata');
const NodeID3 = require('node-id3');
const artworkService = require('./artworkService');

// IEEE 802.3 CRC32 lookup table for OGG container (polynomial 0x04C11DB7)
const oggCrcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let s = i << 24;
  for (let j = 0; j < 8; j++) {
    s = (s & 0x80000000) ? ((s << 1) ^ 0x04c11db7) : (s << 1);
  }
  oggCrcTable[i] = s >>> 0;
}

class AudioTaggingService {
  /**
   * Compute 32-bit CRC checksum for an OGG page.
   */
  _computeOggCrc(buf) {
    let crc = 0;
    for (let i = 0; i < buf.length; i++) {
      crc = ((crc << 8) ^ oggCrcTable[((crc >>> 24) ^ buf[i]) & 0xff]) >>> 0;
    }
    return crc;
  }

  /**
   * Package a packet payload into valid Ogg pages with segment headers and CRCs.
   * Properly sets continuation flag (bit 0 = 0x01) on continuation pages per RFC 3533.
   */
  _createOggPages(packet, serialNo, startSeq, headerType = 0, granulePos = 0n) {
    const pages = [];
    let offset = 0;
    let seq = startSeq;

    while (offset < packet.length || (offset === 0 && packet.length === 0)) {
      const isContinuation = pages.length > 0;
      const flags = isContinuation ? (headerType | 0x01) : headerType;

      const segs = [];
      let pageDataLen = 0;
      while (segs.length < 255 && offset + pageDataLen < packet.length) {
        const segLen = Math.min(255, packet.length - (offset + pageDataLen));
        segs.push(segLen);
        pageDataLen += segLen;
        if (segLen < 255) {
          break; // packet ends
        }
      }

      const pagePayload = packet.subarray(offset, offset + pageDataLen);
      offset += pageDataLen;

      const pageHeader = Buffer.alloc(27 + segs.length);
      pageHeader.write('OggS', 0, 4, 'ascii');
      pageHeader.writeUInt8(0, 4); // version
      pageHeader.writeUInt8(flags, 5); // header type (flags)
      pageHeader.writeBigInt64LE(granulePos, 6);
      pageHeader.writeUInt32LE(serialNo, 14);
      pageHeader.writeUInt32LE(seq, 18);
      pageHeader.writeUInt32LE(0, 22); // zero checksum
      pageHeader.writeUInt8(segs.length, 26);
      for (let i = 0; i < segs.length; i++) {
        pageHeader.writeUInt8(segs[i], 27 + i);
      }

      const fullPage = Buffer.concat([pageHeader, pagePayload]);
      fullPage.writeUInt32LE(this._computeOggCrc(fullPage), 22);
      pages.push(fullPage);
      seq++;
    }
    return pages;
  }
  /**
   * Reads and inspects complete metadata, tags, format, and embedded artwork from an audio file.
   * @param {string} filePath
   * @returns {Promise<Object>}
   */
  async readMetadata(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const metadata = await mm.parseFile(filePath, { duration: true });
    const common = metadata.common || {};
    const format = metadata.format || {};

    const hasArtwork = Array.isArray(common.picture) && common.picture.length > 0;
    const picture = hasArtwork ? common.picture[0] : null;

    let qualityTier = 'UNKNOWN';
    const fmt = (format.container || format.codec || '').toLowerCase();
    if (fmt.includes('flac') || fmt.includes('wav') || fmt.includes('alac')) {
      qualityTier = 'LOSSLESS';
    } else if (format.bitrate && format.bitrate >= 256000) {
      qualityTier = 'HIGH_BITRATE_LOSSY';
    } else if (format.bitrate && format.bitrate > 0) {
      qualityTier = 'STANDARD_LOSSY';
    }

    return {
      title: common.title || null,
      artist: common.artist || null,
      album: common.album || null,
      albumArtist: common.albumartist || null,
      trackNumber: common.track?.no || null,
      trackTotal: common.track?.of || null,
      year: common.year || (common.date ? parseInt(common.date, 10) : null),
      genre: Array.isArray(common.genre) ? common.genre.join(', ') : (common.genre || null),
      duration: Math.round(format.duration || 0),
      bitrate: format.bitrate ? Math.round(format.bitrate) : null,
      sampleRate: format.sampleRate || null,
      channels: format.numberOfChannels || null,
      format: fmt.includes('flac') ? 'flac' : (fmt.includes('ogg') ? 'ogg' : 'mp3'),
      qualityTier,
      hasArtwork,
      artworkMime: picture?.format || null,
      artworkSize: picture?.data?.length || 0,
    };
  }

  /**
   * Tag an audio file (MP3, FLAC, or OGG) with metadata and embedded artwork.
   * Strictly enforces that lossy audio is never converted to FLAC and claimed as lossless.
   *
   * @param {string} filePath
   * @param {Object} tags - { title, artist, album, albumArtist, trackNumber, year, genre, targetFormat }
   * @param {Buffer} [artworkBuffer]
   * @param {string} [mimeType='image/jpeg']
   */
  async tagAudioFile(filePath, tags, artworkBuffer = null, mimeType = 'image/jpeg') {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();

    // Check anti-fabrication rule: Do not convert lossy audio into FLAC and claim it is lossless
    if (tags.targetFormat === 'flac' && (ext === '.mp3' || ext === '.ogg' || ext === '.m4a')) {
      throw new Error('Prohibited operation: Cannot convert lossy audio into FLAC and claim it is lossless.');
    }

    // Validate artwork if provided
    let validArt = null;
    if (artworkBuffer) {
      const artCheck = artworkService.validateImageBuffer(artworkBuffer);
      if (artCheck.valid) {
        validArt = {
          buffer: artworkBuffer,
          mimeType: artCheck.mimeType,
          width: artCheck.width || 500,
          height: artCheck.height || 500,
        };
      }
    }

    if (ext === '.mp3') {
      return this._tagMp3(filePath, tags, validArt);
    } else if (ext === '.flac') {
      return this._tagFlac(filePath, tags, validArt);
    } else if (ext === '.ogg') {
      return this._tagOgg(filePath, tags, validArt);
    } else {
      throw new Error(`Unsupported audio format for tagging: ${ext}`);
    }
  }

  /**
   * Write ID3v2.3 tags to an MP3 file using node-id3.
   * Only tags album track number if verified; never substitutes playlist position.
   */
  async _tagMp3(filePath, tags, validArt) {
    let albumTrackNo = undefined;
    if (tags.albumTrackNumber !== undefined) {
      albumTrackNo = tags.albumTrackNumber;
    } else if (tags.album_track_number !== undefined) {
      albumTrackNo = tags.album_track_number;
    } else if (tags.trackNumber !== undefined) {
      albumTrackNo = tags.trackNumber;
    }

    const id3Tags = {
      title: tags.title,
      artist: tags.artist,
      album: tags.album || tags.title,
      performerInfo: tags.albumArtist || tags.artist,
      trackNumber: (albumTrackNo !== undefined && albumTrackNo !== null) ? String(albumTrackNo) : undefined,
      year: tags.year ? String(tags.year) : undefined,
      genre: tags.genre || 'Pop',
      comment: {
        language: 'eng',
        text: 'Tagged by YT_PLAYLISTMERGER',
      },
    };

    if (validArt) {
      id3Tags.image = {
        mime: validArt.mimeType,
        type: { id: 3, name: 'front cover' },
        description: 'Cover',
        imageBuffer: validArt.buffer,
      };
    }

    const success = NodeID3.write(id3Tags, filePath);
    if (!success) {
      throw new Error(`Failed to write ID3 tags to MP3 file at ${filePath}`);
    }

    return this.readMetadata(filePath);
  }

  /**
   * Write Vorbis Comment metadata and Picture metadata block to a FLAC file.
   * Conforms to RFC FLAC binary structure.
   */
  async _tagFlac(filePath, tags, validArt) {
    const fileBuf = fs.readFileSync(filePath);

    // FLAC must start with 'fLaC' (0x66 0x4C 0x61 0x43)
    if (fileBuf.toString('ascii', 0, 4) !== 'fLaC') {
      throw new Error('Invalid FLAC file signature');
    }

    // Parse existing blocks and find where audio data starts
    let offset = 4;
    let streamInfoBlock = null;
    let isLast = false;

    while (offset < fileBuf.length && !isLast) {
      const headerByte = fileBuf[offset];
      isLast = (headerByte & 0x80) !== 0;
      const blockType = headerByte & 0x7f;
      const length = (fileBuf[offset + 1] << 16) | (fileBuf[offset + 2] << 8) | fileBuf[offset + 3];

      if (blockType === 0) {
        // STREAMINFO block
        streamInfoBlock = fileBuf.slice(offset, offset + 4 + length);
      }

      offset += 4 + length;
    }

    const audioDataStart = offset;
    const audioData = fileBuf.slice(audioDataStart);

    if (!streamInfoBlock) {
      throw new Error('Missing STREAMINFO block in FLAC file');
    }

    // Build VORBIS_COMMENT block
    const comments = [];
    if (tags.title) comments.push(`TITLE=${tags.title}`);
    if (tags.artist) comments.push(`ARTIST=${tags.artist}`);
    if (tags.album) comments.push(`ALBUM=${tags.album}`);
    if (tags.albumArtist) comments.push(`ALBUMARTIST=${tags.albumArtist}`);

    let albumTrackNo = undefined;
    if (tags.albumTrackNumber !== undefined) {
      albumTrackNo = tags.albumTrackNumber;
    } else if (tags.album_track_number !== undefined) {
      albumTrackNo = tags.album_track_number;
    } else if (tags.trackNumber !== undefined) {
      albumTrackNo = tags.trackNumber;
    }
    if (albumTrackNo !== undefined && albumTrackNo !== null) {
      comments.push(`TRACKNUMBER=${albumTrackNo}`);
    }

    if (tags.year) comments.push(`DATE=${tags.year}`);
    if (tags.genre) comments.push(`GENRE=${tags.genre}`);

    const vorbisBlockData = this._buildVorbisCommentData(comments);
    const pictureBlockData = validArt ? this._buildFlacPictureBlock(validArt) : null;

    // Assemble new FLAC file:
    // 1. 'fLaC'
    // 2. STREAMINFO (isLast = 0)
    // 3. VORBIS_COMMENT (isLast = pictureBlockData ? 0 : 1)
    // 4. PICTURE (if present, isLast = 1)
    // 5. Audio data

    const flacHeader = Buffer.from('fLaC', 'ascii');

    // Ensure STREAMINFO is not marked as last
    const streamInfoCopy = Buffer.from(streamInfoBlock);
    streamInfoCopy[0] = streamInfoCopy[0] & 0x7f; // clear last-block bit

    // Vorbis Comment Header: type 4, isLast?
    const vorbisIsLast = pictureBlockData ? 0x04 : 0x84;
    const vorbisHeader = Buffer.alloc(4);
    vorbisHeader[0] = vorbisIsLast;
    vorbisHeader[1] = (vorbisBlockData.length >> 16) & 0xff;
    vorbisHeader[2] = (vorbisBlockData.length >> 8) & 0xff;
    vorbisHeader[3] = vorbisBlockData.length & 0xff;

    const parts = [flacHeader, streamInfoCopy, vorbisHeader, vorbisBlockData];

    if (pictureBlockData) {
      const picHeader = Buffer.alloc(4);
      picHeader[0] = 0x86; // type 6 (PICTURE), isLast = 1
      picHeader[1] = (pictureBlockData.length >> 16) & 0xff;
      picHeader[2] = (pictureBlockData.length >> 8) & 0xff;
      picHeader[3] = pictureBlockData.length & 0xff;
      parts.push(picHeader, pictureBlockData);
    }

    parts.push(audioData);

    const outputBuf = Buffer.concat(parts);
    fs.writeFileSync(filePath, outputBuf);

    return this.readMetadata(filePath);
  }

  /**
   * Build Vorbis comment binary payload.
   */
  _buildVorbisCommentData(commentStrings) {
    const vendor = Buffer.from('YT_PLAYLISTMERGER', 'utf8');
    let totalLen = 4 + vendor.length + 4; // vendor_length + vendor + comment_count

    const commentBuffers = commentStrings.map(str => {
      const b = Buffer.from(str, 'utf8');
      totalLen += 4 + b.length;
      return b;
    });

    const out = Buffer.alloc(totalLen);
    let pos = 0;

    out.writeUInt32LE(vendor.length, pos); pos += 4;
    vendor.copy(out, pos); pos += vendor.length;

    out.writeUInt32LE(commentBuffers.length, pos); pos += 4;

    for (const cb of commentBuffers) {
      out.writeUInt32LE(cb.length, pos); pos += 4;
      cb.copy(out, pos); pos += cb.length;
    }

    return out;
  }

  /**
   * Build FLAC METADATA_BLOCK_PICTURE binary payload.
   */
  _buildFlacPictureBlock(validArt) {
    const mimeBuf = Buffer.from(validArt.mimeType, 'ascii');
    const descBuf = Buffer.from('Cover', 'utf8');
    const picData = validArt.buffer;

    const totalLen =
      4 + // picture type: 3 (front cover)
      4 + mimeBuf.length +
      4 + descBuf.length +
      4 + // width
      4 + // height
      4 + // color depth
      4 + // index colors
      4 + picData.length;

    const out = Buffer.alloc(totalLen);
    let pos = 0;

    out.writeUInt32BE(3, pos); pos += 4; // front cover

    out.writeUInt32BE(mimeBuf.length, pos); pos += 4;
    mimeBuf.copy(out, pos); pos += mimeBuf.length;

    out.writeUInt32BE(descBuf.length, pos); pos += 4;
    descBuf.copy(out, pos); pos += descBuf.length;

    out.writeUInt32BE(validArt.width || 500, pos); pos += 4;
    out.writeUInt32BE(validArt.height || 500, pos); pos += 4;
    out.writeUInt32BE(24, pos); pos += 4; // depth: 24
    out.writeUInt32BE(0, pos); pos += 4; // index colors: 0

    out.writeUInt32BE(picData.length, pos); pos += 4;
    picData.copy(out, pos); pos += picData.length;

    return out;
  }

  /**
   * Tag OGG Vorbis audio file.
   * Conforms to RFC 3533 (Ogg bitstream framing) & Vorbis I specification.
   * Replaces Packet 2 (Vorbis comment header), preserves Packet 3 (Setup header),
   * embeds METADATA_BLOCK_PICTURE if artwork is provided, re-segments Ogg pages
   * with proper continuation flags, recalculates IEEE 802.3 CRCs, and updates
   * sequence numbers for subsequent audio pages while preserving granule positions.
   */
  async _tagOgg(filePath, tags, validArt) {
    const orig = fs.readFileSync(filePath);
    if (orig.length < 58 || orig.toString('ascii', 0, 4) !== 'OggS') {
      throw new Error('Invalid OGG file: missing OggS signature');
    }

    // Parse all pages from the original Ogg stream
    let pos = 0;
    const pages = [];

    while (pos < orig.length && orig.toString('ascii', pos, pos + 4) === 'OggS') {
      const segCount = orig.readUInt8(pos + 26);
      let dataLen = 0;
      const segs = [];
      for (let i = 0; i < segCount; i++) {
        const s = orig.readUInt8(pos + 27 + i);
        segs.push(s);
        dataLen += s;
      }
      const pageTotalLen = 27 + segCount + dataLen;
      pages.push({
        headerType: orig.readUInt8(pos + 5),
        granulePos: orig.readBigInt64LE(pos + 6),
        serialNo: orig.readUInt32LE(pos + 14),
        pageSeq: orig.readUInt32LE(pos + 18),
        segs,
        pageTotalLen,
        payload: orig.subarray(pos + 27 + segCount, pos + pageTotalLen),
        raw: orig.subarray(pos, pos + pageTotalLen),
      });
      pos += pageTotalLen;
    }

    if (pages.length < 2) {
      throw new Error('Invalid OGG stream: insufficient pages');
    }

    const p0 = pages[0].raw;
    const serialNo = pages[0].serialNo;

    // Verify Vorbis header in Page 0 (starts at offset 28)
    const p0Payload = pages[0].payload;
    if (p0Payload.length < 7 || !p0Payload.toString('ascii', 1, 7).includes('vorbis')) {
      throw new Error('Unsupported OGG format: only Ogg Vorbis is currently supported for tagging');
    }

    // Locate Packet 3 (Setup Header) and find where audio pages start
    let p3Buf = null;
    let audioStartPageIdx = -1;
    let packetChunks = [];
    let currentPacketType = null;
    let p3Finished = false;

    for (let pi = 1; pi < pages.length && !p3Finished; pi++) {
      const page = pages[pi];
      let offsetInPayload = 0;

      for (let si = 0; si < page.segs.length; si++) {
        const segLen = page.segs[si];
        const chunk = page.payload.subarray(offsetInPayload, offsetInPayload + segLen);
        offsetInPayload += segLen;

        if (!currentPacketType) {
          if (chunk.length >= 7 && chunk.toString('ascii', 1, 7) === 'vorbis') {
            currentPacketType = chunk[0];
          }
        }
        packetChunks.push(chunk);

        if (segLen < 255) {
          if (currentPacketType === 5) {
            p3Buf = Buffer.concat(packetChunks);
            p3Finished = true;
            audioStartPageIdx = pi + 1;
            break;
          }
          packetChunks = [];
          currentPacketType = null;
        }
      }
    }

    if (!p3Buf || audioStartPageIdx < 0) {
      throw new Error('Failed to locate Vorbis Setup Header (Packet 3) in OGG stream');
    }

    // Build new Vorbis Comment packet (Packet 2)
    const comments = [];
    if (tags.title) comments.push(`TITLE=${tags.title}`);
    if (tags.artist) comments.push(`ARTIST=${tags.artist}`);
    if (tags.album) comments.push(`ALBUM=${tags.album}`);
    if (tags.albumArtist) comments.push(`ALBUMARTIST=${tags.albumArtist}`);

    let albumTrackNo = undefined;
    if (tags.albumTrackNumber !== undefined) {
      albumTrackNo = tags.albumTrackNumber;
    } else if (tags.album_track_number !== undefined) {
      albumTrackNo = tags.album_track_number;
    } else if (tags.trackNumber !== undefined) {
      albumTrackNo = tags.trackNumber;
    }
    if (albumTrackNo !== undefined && albumTrackNo !== null) {
      comments.push(`TRACKNUMBER=${albumTrackNo}`);
    }

    if (tags.year) comments.push(`DATE=${tags.year}`);
    if (tags.genre) comments.push(`GENRE=${tags.genre}`);

    // If artwork is provided, build METADATA_BLOCK_PICTURE (base64 of FLAC picture block)
    if (validArt) {
      const picBlock = this._buildFlacPictureBlock(validArt);
      const base64Pic = picBlock.toString('base64');
      comments.push(`METADATA_BLOCK_PICTURE=${base64Pic}`);
    }

    const vendor = Buffer.from('YT_PLAYLISTMERGER', 'utf8');
    let commLen = 7 + 4 + vendor.length + 4;
    for (const c of comments) {
      commLen += 4 + Buffer.byteLength(c, 'utf8');
    }
    commLen += 1; // framing bit

    const p2Buf = Buffer.alloc(commLen);
    let p = 0;
    p2Buf.write('\x03vorbis', p, 7, 'ascii'); p += 7;
    p2Buf.writeUInt32LE(vendor.length, p); p += 4;
    vendor.copy(p2Buf, p); p += vendor.length;
    p2Buf.writeUInt32LE(comments.length, p); p += 4;
    for (const c of comments) {
      const cBuf = Buffer.from(c, 'utf8');
      p2Buf.writeUInt32LE(cBuf.length, p); p += 4;
      cBuf.copy(p2Buf, p); p += cBuf.length;
    }
    p2Buf.writeUInt8(0x01, p); // framing bit

    // Create Ogg pages for Packet 2 (Vorbis comments)
    const p2Pages = this._createOggPages(p2Buf, serialNo, 1, 0, 0n);

    // Create Ogg pages for Packet 3 (Setup header)
    let nextSeq = 1 + p2Pages.length;
    const p3Pages = this._createOggPages(p3Buf, serialNo, nextSeq, 0, 0n);
    nextSeq += p3Pages.length;

    // Rewrite following audio pages with new sequence numbers & recalculated CRCs, preserving granule positions & header flags
    const restPages = [];
    for (let pi = audioStartPageIdx; pi < pages.length; pi++) {
      const page = pages[pi];
      const pageBuf = Buffer.from(page.raw);

      pageBuf.writeUInt32LE(nextSeq++, 18);
      pageBuf.writeUInt32LE(0, 22);
      pageBuf.writeUInt32LE(this._computeOggCrc(pageBuf), 22);

      restPages.push(pageBuf);
    }

    const finalOgg = Buffer.concat([p0, ...p2Pages, ...p3Pages, ...restPages]);
    fs.writeFileSync(filePath, finalOgg);

    return this.readMetadata(filePath);
  }

  /**
   * Generate a minimal valid MP3 file buffer for testing purposes.
   */
  createTestMp3Buffer() {
    // Standard minimal MP3 frame header: FFFB 9044 ...
    const header = Buffer.from([0xff, 0xfb, 0x90, 0x44]);
    const silence = Buffer.alloc(414); // 418 bytes standard MP3 frame
    return Buffer.concat([header, silence]);
  }

  /**
   * Generate a minimal valid FLAC file buffer for testing purposes.
   */
  createTestFlacBuffer() {
    // 1. Signature 'fLaC'
    const sig = Buffer.from('fLaC', 'ascii');

    // 2. STREAMINFO block (34 bytes payload), isLast = 1
    const streamInfoPayload = Buffer.alloc(34);
    // min/max blocksize: 4096 (0x1000)
    streamInfoPayload.writeUInt16BE(4096, 0);
    streamInfoPayload.writeUInt16BE(4096, 2);
    // sample rate: 44100, 2 channels, 16 bits, 44100 samples (1 sec)
    // 44100 (20 bits), 2 channels (3 bits), 16 bits (5 bits), 44100 samples (36 bits)
    streamInfoPayload.writeUInt8((44100 >> 12) & 0xff, 10);
    streamInfoPayload.writeUInt8((44100 >> 4) & 0xff, 11);
    streamInfoPayload.writeUInt8(((44100 & 0x0f) << 4) | (1 << 1), 12); // channels - 1 = 1
    streamInfoPayload.writeUInt8((15 << 4), 13); // bits - 1 = 15

    const streamInfoHeader = Buffer.from([0x80, 0x00, 0x00, 0x22]); // isLast=1, type=0, len=34

    // 3. Audio frame: sync code 0xFFF8 (14 bits 11111111111110)
    const audioFrame = Buffer.alloc(100);
    audioFrame[0] = 0xff;
    audioFrame[1] = 0xf8;

    return Buffer.concat([sig, streamInfoHeader, streamInfoPayload, audioFrame]);
  }

  /**
   * Generate a valid OGG Vorbis file buffer for testing purposes.
   */
  createTestOggBuffer() {
    const fixturePath = path.join(__dirname, '../../fixtures/sample.ogg');
    if (fs.existsSync(fixturePath)) {
      return fs.readFileSync(fixturePath);
    }
    throw new Error('Test OGG fixture not found at fixtures/sample.ogg');
  }
}

module.exports = new AudioTaggingService();
