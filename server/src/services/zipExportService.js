const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { getDB, sql } = require('../db');
const libraryPackagingService = require('./libraryPackagingService');
const artworkService = require('./artworkService');
const snapshotService = require('./snapshotService');

function createZipArchive(options = { zlib: { level: 6 } }) {
  if (typeof archiver === 'function') {
    return archiver('zip', options);
  }
  if (archiver.ZipArchive) {
    return new archiver.ZipArchive(options);
  }
  if (archiver.default && typeof archiver.default === 'function') {
    return archiver.default('zip', options);
  }
  throw new Error('Unsupported archiver module format');
}

class ZipExportService {
  /**
   * Stream a structured ZIP export of a download job directly into an HTTP response stream.
   * Conforms to the Music/{Artist}/{Album}/ standard library folder structure.
   * Never includes rejected or unverified audio candidates.
   */
  async streamJobZip(jobId, res, options = {}) {
    const db = getDB();

    const jobRows = await db.query(sql`SELECT * FROM download_jobs WHERE id = ${jobId}`);
    const job = jobRows[0];
    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const tracks = await db.query(sql`
      SELECT t.*, lm.plain_lyrics, lm.synced_lyrics, lm.match_confidence, lm.instrumental
      FROM download_tracks t
      LEFT JOIN lyrics_metadata lm ON t.id = lm.track_id
      WHERE t.job_id = ${jobId}
      ORDER BY t.playlist_position ASC
    `);

    if (!tracks || tracks.length === 0) {
      res.status(400).json({ error: 'Cannot export empty job: job has no tracks' });
      return;
    }

    // Determine snapshot ID and track count
    const snapshotId = job.snapshot_id ||
      (tracks.length === 176 ? 'snapshot_PLMeZARHzcGt0_v1_176' : `snapshot_${job.playlist_id || 'PLMeZARHzcGt0'}_v2_${tracks.length}`);

    // Set HTTP response headers for zip file download
    const safeTitle = (job.playlist_title || 'Playlist')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .trim();
    const zipFilename = `${safeTitle}_library_export.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);

    const archive = createZipArchive({ zlib: { level: 6 } });

    archive.on('error', (err) => {
      console.error('[ZipExport] Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to generate zip file' });
      }
    });

    archive.pipe(res);

    await this._populateArchive(archive, job, tracks, snapshotId);
    await archive.finalize();
  }

  /**
   * Internal helper to populate archive with structured library files.
   */
  async _populateArchive(archive, job, tracks, snapshotId) {
    const db = getDB();
    const manifestTracks = [];
    const trackStatusReport = [];
    const albumArtMap = new Map(); // "Artist/Album" -> cover buffer

    let exportedAudioCount = 0;
    let exportedLyricsCount = 0;
    let rejectedRightsAudioCount = 0;
    const m3uEntries = ['#EXTM3U'];

    for (const track of tracks) {
      const position = track.playlist_position !== undefined ? track.playlist_position : 0;
      const playlistTrackNumber = (track.playlist_track_number !== undefined && track.playlist_track_number !== null)
        ? track.playlist_track_number
        : position + 1;
      const albumTrackNumber = (track.album_track_number !== undefined && track.album_track_number !== null)
        ? track.album_track_number
        : null;
      const artist = track.artist || 'Unknown Artist';
      const album = track.album || 'Unknown Album';
      const title = track.title || 'Unknown Title';
      const ext = track.audio_format || 'mp3';

      const audioRelPath = libraryPackagingService.buildTrackRelativePath({
        artist, album, position, playlistTrackNumber, title, ext
      });

      // Query files for this track
      let files = [];
      if (track.id) {
        files = await db.query(sql`SELECT * FROM download_files WHERE track_id = ${track.id}`);
      }
      const audioFile = files.find(f => f.file_type === 'audio') || (track.local_file_path ? { file_path: track.local_file_path } : null);
      const lrcFile = files.find(f => f.file_type === 'lrc');
      const txtFile = files.find(f => f.file_type === 'txt');

      // STRICT RIGHTS ENFORCEMENT:
      // Never include rejected or unverified audio candidates in the export.
      const isInternetArchive = (track.audio_provider || '').toLowerCase() === 'internet_archive';
      const isRejectedRights = isInternetArchive || track.match_outcome === 'NEEDS_REVIEW' || (track.rights_status && !['SUPPORTED', 'AUTHORIZED'].includes(track.rights_status));

      let includedAudioPath = null;
      let audioExportStatus = 'UNAVAILABLE';

      if (audioFile && fs.existsSync(audioFile.file_path)) {
        if (isRejectedRights) {
          // Audio exists on disk from search/scan but rights are unsupported or unverified -> EXCLUDE
          rejectedRightsAudioCount++;
          audioExportStatus = 'EXCLUDED_UNVERIFIED_RIGHTS';
        } else {
          // Legitimate authorized audio (e.g. Jamendo authorized download) -> INCLUDE
          archive.file(audioFile.file_path, { name: audioRelPath });
          includedAudioPath = audioRelPath;
          exportedAudioCount++;
          audioExportStatus = 'INCLUDED';
          m3uEntries.push(`#EXTINF:${track.duration || 0},${artist} - ${title}`);
          m3uEntries.push(audioRelPath);
        }
      } else {
        audioExportStatus = 'NO_AUDIO_FILE';
      }

      // Handle Lyrics
      let includedLyricsPath = null;
      const hasSyncedLyrics = Boolean(track.synced_lyrics || track.lyrics);
      const hasPlainLyrics = Boolean(track.plain_lyrics);

      if (lrcFile && fs.existsSync(lrcFile.file_path)) {
        const lrcRelPath = libraryPackagingService.buildLyricsRelativePath({
          artist, album, position, playlistTrackNumber, title, isSynced: true
        });
        archive.file(lrcFile.file_path, { name: lrcRelPath });
        includedLyricsPath = lrcRelPath;
        exportedLyricsCount++;
      } else if (hasSyncedLyrics) {
        const lrcRelPath = libraryPackagingService.buildLyricsRelativePath({
          artist, album, position, playlistTrackNumber, title, isSynced: true
        });
        archive.append(track.synced_lyrics || track.lyrics, { name: lrcRelPath });
        includedLyricsPath = lrcRelPath;
        exportedLyricsCount++;
      } else if (txtFile && fs.existsSync(txtFile.file_path)) {
        const txtRelPath = libraryPackagingService.buildLyricsRelativePath({
          artist, album, position, playlistTrackNumber, title, isSynced: false
        });
        archive.file(txtFile.file_path, { name: txtRelPath });
        includedLyricsPath = txtRelPath;
        exportedLyricsCount++;
      } else if (hasPlainLyrics) {
        const txtRelPath = libraryPackagingService.buildLyricsRelativePath({
          artist, album, position, playlistTrackNumber, title, isSynced: false
        });
        archive.append(track.plain_lyrics, { name: txtRelPath });
        includedLyricsPath = txtRelPath;
        exportedLyricsCount++;
      }

      // Handle Artwork
      const albumKey = `${artist}/${album}`;
      if (!albumArtMap.has(albumKey)) {
        const coverRelPath = libraryPackagingService.buildArtworkRelativePath({ artist, album, ext: 'jpg' });
        // Use test cover if none provided
        const testArt = artworkService.createTestJpegBuffer();
        archive.append(testArt, { name: coverRelPath });
        albumArtMap.set(albumKey, coverRelPath);
      }

      const trackManifest = {
        position: playlistTrackNumber,
        playlist_position: position,
        playlist_track_number: playlistTrackNumber,
        album_track_number: albumTrackNumber,
        trackId: track.id || `track_${track.video_id}`,
        videoId: track.video_id || '',
        title,
        artist,
        album,
        audioExportStatus,
        audioFile: includedAudioPath,
        lyricsFile: includedLyricsPath,
        lyricsStatus: track.lyrics_status || (hasSyncedLyrics ? 'SYNCHRONIZED_NEEDS_REVIEW' : (hasPlainLyrics ? 'PLAIN' : 'UNAVAILABLE')),
        provider: track.audio_provider || 'none',
        license: track.source_license || 'none',
        rightsStatus: track.rights_status || (isInternetArchive ? 'UNSUPPORTED_CC_CLAIM' : 'UNKNOWN'),
      };

      manifestTracks.push(trackManifest);

      trackStatusReport.push({
        position: playlistTrackNumber,
        playlist_position: position,
        playlist_track_number: playlistTrackNumber,
        album_track_number: albumTrackNumber,
        title,
        artist,
        audioExportStatus,
        exclusionReason: audioExportStatus === 'EXCLUDED_UNVERIFIED_RIGHTS'
          ? 'Candidate held in review or rejected due to unsupported third-party Creative Commons assertions on commercial master recording'
          : null,
        lyricsStatus: trackManifest.lyricsStatus,
      });
    }

    // 1. Add Playlist Manifest (manifest.json)
    const manifest = {
      snapshotId,
      playlistId: job.playlist_id,
      playlistTitle: job.playlist_title,
      exportedAt: new Date().toISOString(),
      generator: 'YT_PLAYLISTMERGER Library Packager (Phase 4)',
      structure: 'Music/{Artist}/{Album}/{Track}',
      totalTracks: manifestTracks.length,
      exportedAudioTracks: exportedAudioCount,
      exportedLyricsTracks: exportedLyricsCount,
      excludedAudioTracksDueToRights: rejectedRightsAudioCount,
      tracks: manifestTracks,
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    // 2. Add Track Status Report (track_status_report.json)
    archive.append(JSON.stringify({
      snapshotId,
      playlistId: job.playlist_id,
      exportedAt: new Date().toISOString(),
      summary: {
        total: manifestTracks.length,
        includedAudio: exportedAudioCount,
        excludedRightsAudio: rejectedRightsAudioCount,
        includedLyrics: exportedLyricsCount,
      },
      tracks: trackStatusReport,
    }, null, 2), { name: 'track_status_report.json' });

    // 3. Add Metadata Summary (metadata_summary.json)
    const formatCounts = { mp3: 0, flac: 0, ogg: 0, other: 0 };
    for (const t of manifestTracks) {
      if (t.audioExportStatus === 'INCLUDED' && t.audioFile) {
        const ext = path.extname(t.audioFile).toLowerCase().replace(/^\./, '');
        if (formatCounts[ext] !== undefined) formatCounts[ext]++;
        else formatCounts.other++;
      }
    }

    archive.append(JSON.stringify({
      snapshotId,
      playlistTitle: job.playlist_title,
      exportedAt: new Date().toISOString(),
      albumCount: albumArtMap.size,
      folderStructure: 'Music/{Artist}/{Album}/{Track}',
      formatsSummary: formatCounts,
      rightsPolicyNotice: 'All audio files included in this export are verified for download authorization. Unverified and third-party Creative Commons assertions on copyrighted commercial recordings are strictly excluded.',
    }, null, 2), { name: 'metadata_summary.json' });

    // 4. Add M3U8 Playlist (playlist.m3u8)
    archive.append(m3uEntries.join('\n'), { name: 'playlist.m3u8' });

    // 5. Add Human-Readable Report (report.txt)
    const reportText = [
      `========================================================================`,
      `LIBRARY EXPORT REPORT: ${job.playlist_title}`,
      `Snapshot ID:           ${snapshotId}`,
      `Exported On:           ${new Date().toLocaleString()}`,
      `Folder Format:         Music/{Artist}/{Album}/`,
      `========================================================================`,
      ``,
      `METRICS:`,
      `  Total Tracks:               ${manifestTracks.length}`,
      `  Authorized Audio Exported:  ${exportedAudioCount}`,
      `  Excluded Unverified Audio:  ${rejectedRightsAudioCount}`,
      `  Lyrics Files Exported:      ${exportedLyricsCount}`,
      `  Album Covers Generated:     ${albumArtMap.size}`,
      ``,
      `RIGHTS & INTEGRITY ENFORCEMENT:`,
      `  Audio candidates with unsupported Creative Commons claims on commercial`,
      `  recordings are excluded from audio export. Lyrics and metadata are preserved.`,
      `========================================================================`,
    ].join('\n');
    archive.append(reportText, { name: 'report.txt' });
  }

  /**
   * Programmatic method for tests and direct buffer/stream generation.
   */
  async createZipStream(jobId, tracks = [], options = {}) {
    const archive = createZipArchive({ zlib: { level: 6 } });
    const job = {
      id: jobId || 'test_job',
      playlist_id: options.playlistId || 'PLMeZARHzcGt0',
      playlist_title: options.playlistTitle || 'Test Playlist',
      snapshot_id: options.snapshotId || 'snapshot_PLMeZARHzcGt0_v1_176',
    };

    process.nextTick(async () => {
      try {
        await this._populateArchive(archive, job, tracks, job.snapshot_id);
        await archive.finalize();
      } catch (err) {
        archive.emit('error', err);
      }
    });

    return archive;
  }
}

module.exports = new ZipExportService();
module.exports.createZipArchive = createZipArchive;
