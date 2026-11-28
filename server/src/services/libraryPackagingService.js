const fs = require('fs');
const path = require('path');
const audioTaggingService = require('./audioTaggingService');
const artworkService = require('./artworkService');

class LibraryPackagingService {
  /**
   * Sanitize path segment while strictly preserving Unicode letters, spaces, and hyphens.
   * Strips illegal filesystem characters: / \ : * ? " < > |
   */
  sanitizeSegment(str, fallback = 'Unknown') {
    if (!str || typeof str !== 'string') return fallback;

    // Remove illegal filesystem characters
    let cleaned = str
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Prevent trailing dots or spaces which cause issues on Windows
    cleaned = cleaned.replace(/[\.\s]+$/, '');

    return cleaned || fallback;
  }

  /**
   * Format track number with leading zero (e.g. 1 -> "01", 12 -> "12", 105 -> "105").
   */
  formatTrackNumber(pos) {
    const num = (pos !== undefined && pos !== null) ? pos + 1 : 1;
    return String(num).padStart(2, '0');
  }

  /**
   * Build consistent library relative path:
   * Music/{Artist}/{Album}/{01 - Track.ext}
   */
  buildTrackRelativePath({ artist, album, position, playlistTrackNumber, title, ext = 'mp3' }) {
    const safeArtist = this.sanitizeSegment(artist, 'Unknown Artist');
    const safeAlbum = this.sanitizeSegment(album, 'Unknown Album');
    const trackNum = (playlistTrackNumber !== undefined && playlistTrackNumber !== null)
      ? String(playlistTrackNumber).padStart(2, '0')
      : this.formatTrackNumber(position);
    const safeTitle = this.sanitizeSegment(title, `Track_${trackNum}`);
    const cleanExt = ext.replace(/^\./, '');

    return path.join('Music', safeArtist, safeAlbum, `${trackNum} - ${safeTitle}.${cleanExt}`).replace(/\\/g, '/');
  }

  /**
   * Build lyrics relative path alongside audio track:
   * Music/{Artist}/{Album}/{01 - Track.lrc} or {.txt}
   */
  buildLyricsRelativePath({ artist, album, position, playlistTrackNumber, title, isSynced = true }) {
    const safeArtist = this.sanitizeSegment(artist, 'Unknown Artist');
    const safeAlbum = this.sanitizeSegment(album, 'Unknown Album');
    const trackNum = (playlistTrackNumber !== undefined && playlistTrackNumber !== null)
      ? String(playlistTrackNumber).padStart(2, '0')
      : this.formatTrackNumber(position);
    const safeTitle = this.sanitizeSegment(title, `Track_${trackNum}`);
    const ext = isSynced ? 'lrc' : 'txt';

    return path.join('Music', safeArtist, safeAlbum, `${trackNum} - ${safeTitle}.${ext}`).replace(/\\/g, '/');
  }

  /**
   * Build album artwork relative path:
   * Music/{Artist}/{Album}/cover.jpg
   */
  buildArtworkRelativePath({ artist, album, ext = 'jpg' }) {
    const safeArtist = this.sanitizeSegment(artist, 'Unknown Artist');
    const safeAlbum = this.sanitizeSegment(album, 'Unknown Album');
    const cleanExt = ext.replace(/^\./, '');

    return path.join('Music', safeArtist, safeAlbum, `cover.${cleanExt}`).replace(/\\/g, '/');
  }

  /**
   * Package a track into the library on disk with metadata tagging and artwork embedding.
   */
  async packageTrack({
    baseDir,
    track,
    audioBuffer = null,
    audioFilePath = null,
    lyrics = null,
    isSyncedLyrics = false,
    lyricsStatus = 'UNAVAILABLE',
    artworkBuffer = null,
  }) {
    const artist = track.artist || 'Unknown Artist';
    const album = track.album || 'Unknown Album';
    const playlistPosition = track.playlist_position !== undefined ? track.playlist_position : 0;
    const playlistTrackNumber = (track.playlist_track_number !== undefined && track.playlist_track_number !== null)
      ? track.playlist_track_number
      : playlistPosition + 1;
    const albumTrackNumber = (track.album_track_number !== undefined && track.album_track_number !== null)
      ? track.album_track_number
      : null;
    const title = track.title || 'Unknown Title';

    // 1. Determine destination directory
    const safeArtist = this.sanitizeSegment(artist, 'Unknown Artist');
    const safeAlbum = this.sanitizeSegment(album, 'Unknown Album');
    const destDir = path.join(baseDir, 'Music', safeArtist, safeAlbum);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const trackNum = String(playlistTrackNumber).padStart(2, '0');
    const safeTitle = this.sanitizeSegment(title, `Track_${trackNum}`);

    let packagedAudioPath = null;
    let packagedLyricsPath = null;
    let packagedCoverPath = null;

    // 2. Handle Audio File
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      const ext = path.extname(audioFilePath).toLowerCase().replace(/^\./, '') || 'mp3';
      const destAudioFile = path.join(destDir, `${trackNum} - ${safeTitle}.${ext}`);

      // Handle duplicate filename safety
      const finalAudioFile = this._resolveDuplicateName(destAudioFile);
      fs.copyFileSync(audioFilePath, finalAudioFile);

      // Tag audio file: only tag albumTrackNumber if verified
      try {
        await audioTaggingService.tagAudioFile(
          finalAudioFile,
          {
            title,
            artist,
            album,
            albumArtist: artist,
            albumTrackNumber: albumTrackNumber,
            isAlbumTrackNumberVerified: Boolean(albumTrackNumber),
            year: track.release_year || new Date().getFullYear(),
            genre: track.genre || 'Pop',
          },
          artworkBuffer
        );
      } catch (tagErr) {
        console.warn(`[LibraryPackaging] Tagging warning for ${title}:`, tagErr.message);
      }

      packagedAudioPath = finalAudioFile;
    } else if (audioBuffer) {
      const ext = track.audio_format || 'mp3';
      const destAudioFile = path.join(destDir, `${trackNum} - ${safeTitle}.${ext}`);
      const finalAudioFile = this._resolveDuplicateName(destAudioFile);
      fs.writeFileSync(finalAudioFile, audioBuffer);

      try {
        await audioTaggingService.tagAudioFile(
          finalAudioFile,
          {
            title,
            artist,
            album,
            albumArtist: artist,
            albumTrackNumber: albumTrackNumber,
            isAlbumTrackNumberVerified: Boolean(albumTrackNumber),
            year: track.release_year || new Date().getFullYear(),
            genre: track.genre || 'Pop',
          },
          artworkBuffer
        );
      } catch (tagErr) {
        console.warn(`[LibraryPackaging] Tagging warning for ${title}:`, tagErr.message);
      }

      packagedAudioPath = finalAudioFile;
    }

    // 3. Handle Lyrics
    if (lyrics && typeof lyrics === 'string' && lyrics.trim()) {
      const ext = isSyncedLyrics ? 'lrc' : 'txt';
      const lyricsFile = path.join(destDir, `${trackNum} - ${safeTitle}.${ext}`);
      fs.writeFileSync(lyricsFile, lyrics, 'utf8');
      packagedLyricsPath = lyricsFile;
    }

    // 4. Handle Cover Artwork
    if (artworkBuffer) {
      const coverFile = path.join(destDir, 'cover.jpg');
      if (!fs.existsSync(coverFile)) {
        artworkService.saveArtwork(destDir, artworkBuffer, 'image/jpeg');
      }
      packagedCoverPath = coverFile;
    }

    return {
      playlist_position: playlistPosition,
      playlist_track_number: playlistTrackNumber,
      album_track_number: albumTrackNumber,
      audioPath: packagedAudioPath,
      lyricsPath: packagedLyricsPath,
      coverPath: packagedCoverPath,
      relativeAudioPath: packagedAudioPath ? path.relative(baseDir, packagedAudioPath).replace(/\\/g, '/') : null,
      relativeLyricsPath: packagedLyricsPath ? path.relative(baseDir, packagedLyricsPath).replace(/\\/g, '/') : null,
      lyricsStatus,
    };
  }

  /**
   * Resolve duplicate destination filenames by appending a unique counter before extension.
   */
  _resolveDuplicateName(filePath) {
    if (!fs.existsSync(filePath)) return filePath;
    const dir = path.dirname(filePath);
    const ext = path.extname(filePath);
    const base = path.basename(filePath, ext);

    let counter = 1;
    let candidate = path.join(dir, `${base}_(${counter})${ext}`);
    while (fs.existsSync(candidate)) {
      counter++;
      candidate = path.join(dir, `${base}_(${counter})${ext}`);
    }
    return candidate;
  }
}

module.exports = new LibraryPackagingService();
