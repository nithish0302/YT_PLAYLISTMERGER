/**
 * Phase 4.1 — Final Integration and End-to-End Verification Test Suite
 *
 * Verifies:
 * 1. OGG Vorbis metadata verification & artwork embedding (independent readback via music-metadata).
 * 2. Strict separation of playlist_position, playlist_track_number, and album_track_number.
 * 3. Real end-to-end ZIP export, extraction, SHA-256 checksum verification, and rights exclusion.
 * 4. Independent verification of 176-track and 181-track playlist snapshots.
 * 5. Full API error handling for /api/library endpoints.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const axios = require('axios');
const mm = require('music-metadata');
const { getDB, sql, initDB } = require('./src/db');
const audioTaggingService = require('./src/services/audioTaggingService');
const artworkService = require('./src/services/artworkService');
const libraryPackagingService = require('./src/services/libraryPackagingService');
const zipExportService = require('./src/services/zipExportService');
const snapshotService = require('./src/services/snapshotService');

const API_URL = process.env.API_URL || 'http://localhost:3001';

function sha256(bufferOrPath) {
  const hash = crypto.createHash('sha256');
  if (typeof bufferOrPath === 'string') {
    hash.update(fs.readFileSync(bufferOrPath));
  } else {
    hash.update(bufferOrPath);
  }
  return hash.digest('hex');
}

async function runPhase41Tests() {
  console.log('================================================================');
  console.log('🧪 PHASE 4.1: FINAL INTEGRATION & END-TO-END VERIFICATION');
  console.log('================================================================\n');

  await initDB();
  const testDir = path.join(__dirname, 'test_tmp_phase4_1');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ── TEST 1: OGG Metadata Tagging & Independent Readback ───────────────────
  console.log('--- Test 1: OGG Metadata Tagging & Independent Readback ---');
  try {
    const oggPath = path.join(testDir, 'test_track.ogg');
    const sampleBuf = audioTaggingService.createTestOggBuffer();
    fs.writeFileSync(oggPath, sampleBuf);

    assert(fs.existsSync(oggPath), 'Sample OGG file initialized on disk');
    assert(sampleBuf.length > 0, `Sample OGG buffer has valid size (${sampleBuf.length} bytes)`);

    // Create valid test artwork
    const artBuf = artworkService.createTestJpegBuffer(300, 300);

    // Tag with all required fields
    const targetTags = {
      title: 'Night Owl Symphony',
      artist: 'Galactic Horizon',
      album: 'Cosmic Journey',
      albumArtist: 'Galactic Horizon Collective',
      albumTrackNumber: 4, // Explicitly verified album track number
      year: 2025,
      genre: 'Ambient Electronic',
    };

    console.log('  Tagging OGG file using RFC 3533 Ogg framing & Vorbis Comment specification...');
    const resultMeta = await audioTaggingService.tagAudioFile(
      oggPath,
      targetTags,
      artBuf,
      'image/jpeg'
    );

    // Independently reopen the file from disk using music-metadata
    console.log('  Reopening OGG file and independently parsing metadata...');
    const independentMeta = await mm.parseFile(oggPath);
    const common = independentMeta.common;

    assert(common.title === targetTags.title, `OGG title matches: "${common.title}"`);
    assert(common.artist === targetTags.artist, `OGG artist matches: "${common.artist}"`);
    assert(common.album === targetTags.album, `OGG album matches: "${common.album}"`);
    assert(common.albumartist === targetTags.albumArtist, `OGG albumartist matches: "${common.albumartist}"`);
    assert(common.track.no === 4, `OGG track number matches: ${common.track.no}`);
    assert(common.year === 2025, `OGG year matches: ${common.year}`);
    assert(Array.isArray(common.genre) && common.genre.includes('Ambient Electronic'), `OGG genre matches: "${common.genre}"`);

    // Verify embedded artwork in Vorbis comments
    assert(Array.isArray(common.picture) && common.picture.length > 0, 'OGG has embedded artwork picture');
    if (common.picture && common.picture.length > 0) {
      assert(common.picture[0].format === 'image/jpeg', `OGG artwork MIME is image/jpeg (got ${common.picture[0].format})`);
      assert(common.picture[0].data.length > 0, `OGG artwork data size is ${common.picture[0].data.length} bytes`);
    }
  } catch (err) {
    console.error('  ❌ OGG metadata verification error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 2: Separate Playlist and Album Numbering ─────────────────────────
  console.log('--- Test 2: Separate Playlist and Album Numbering ---');
  try {
    // Case A: Track in playlist with verified album track number
    // Playlist position = 0 (1st song in playlist), but Album Track = 7 (7th song on the CD)
    const trackWithAlbumNo = {
      playlist_position: 0,
      playlist_track_number: 1,
      album_track_number: 7,
      title: 'Thunderstruck',
      artist: 'AC/DC',
      album: 'The Razors Edge',
      audio_format: 'mp3',
    };

    const mp3Buf = audioTaggingService.createTestMp3Buffer();
    const packagedA = await libraryPackagingService.packageTrack({
      baseDir: testDir,
      track: trackWithAlbumNo,
      audioBuffer: mp3Buf,
    });

    assert(packagedA.playlist_position === 0, 'playlist_position preserved as 0 (zero-based)');
    assert(packagedA.playlist_track_number === 1, 'playlist_track_number preserved as 1 (one-based display)');
    assert(packagedA.album_track_number === 7, 'album_track_number preserved as 7 (verified CD track)');

    // File name must use playlist_track_number prefix ("01 - Thunderstruck.mp3")
    assert(packagedA.audioPath.endsWith('01 - Thunderstruck.mp3'), `Filename uses playlist_track_number: ${path.basename(packagedA.audioPath)}`);

    // But audio tags must receive album_track_number ("7")
    const metaA = await audioTaggingService.readMetadata(packagedA.audioPath);
    assert(metaA.trackNumber === 7, `Embedded ID3 trackNumber reflects verified album_track_number: 7 (got ${metaA.trackNumber})`);

    // Case B: Track in playlist where album track number is UNVERIFIED (null)
    // Playlist position = 2 (3rd song in playlist)
    const trackWithoutAlbumNo = {
      playlist_position: 2,
      playlist_track_number: 3,
      album_track_number: null,
      title: 'Random Track',
      artist: 'Independent Artist',
      album: 'Single Collection',
      audio_format: 'mp3',
    };

    const packagedB = await libraryPackagingService.packageTrack({
      baseDir: testDir,
      track: trackWithoutAlbumNo,
      audioBuffer: mp3Buf,
    });

    assert(packagedB.audioPath.endsWith('03 - Random Track.mp3'), `Filename uses playlist_track_number: ${path.basename(packagedB.audioPath)}`);
    const metaB = await audioTaggingService.readMetadata(packagedB.audioPath);
    assert(metaB.trackNumber === null, `Unverified album track number is NOT falsified as playlist position (got null)`);
  } catch (err) {
    console.error('  ❌ Numbering separation error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 3: End-to-End ZIP Export, Extraction, Checksums & Rights Filter ───
  console.log('--- Test 3: Real End-to-End ZIP Export, Extraction & Checksum Verification ---');
  try {
    const db = getDB();
    const testJobId = `job_e2e_${Date.now()}`;
    const testPlaylistId = 'PL_e2e_verify';

    await db.query(sql`
      INSERT INTO download_jobs (id, playlist_id, playlist_title, total_tracks, completed_tracks, status, created_at)
      VALUES (${testJobId}, ${testPlaylistId}, 'E2E Verify Playlist', 4, 3, 'COMPLETED', ${Math.floor(Date.now() / 1000)})
    `);

    // Prepare sample source files on disk
    const srcDir = path.join(testDir, 'e2e_sources');
    fs.mkdirSync(srcDir, { recursive: true });

    const mp3File = path.join(srcDir, 'source_mp3.mp3');
    fs.writeFileSync(mp3File, audioTaggingService.createTestMp3Buffer());

    const flacFile = path.join(srcDir, 'source_flac.flac');
    fs.writeFileSync(flacFile, audioTaggingService.createTestFlacBuffer());

    const oggFile = path.join(srcDir, 'source_ogg.ogg');
    fs.writeFileSync(oggFile, audioTaggingService.createTestOggBuffer());

    // Internet Archive candidate file that has UNVERIFIED/UNSUPPORTED rights
    const iaFile = path.join(srcDir, 'source_unverified_ia.mp3');
    fs.writeFileSync(iaFile, audioTaggingService.createTestMp3Buffer());

    // Track 1: Authorized MP3 with synced lyrics
    const t1Id = `track_e2e_1_${Date.now()}`;
    await db.query(sql`
      INSERT INTO download_tracks (
        id, job_id, video_id, title, artist, album, playlist_position, playlist_track_number,
        album_track_number, audio_provider, audio_format, download_status, match_outcome, local_file_path
      ) VALUES (
        ${t1Id}, ${testJobId}, 'vid_1', 'Faded', 'Alan Walker', 'Different World', 0, 1,
        1, 'jamendo', 'mp3', 'COMPLETED', 'HIGH_CONFIDENCE', ${mp3File}
      )
    `);
    await db.query(sql`
      INSERT INTO download_files (id, track_id, file_type, file_path, file_name, file_size)
      VALUES (${`f1_${Date.now()}`}, ${t1Id}, 'audio', ${mp3File}, 'source_mp3.mp3', ${fs.statSync(mp3File).size})
    `);
    await db.query(sql`
      INSERT INTO lyrics_metadata (id, track_id, synced_lyrics, instrumental, match_confidence)
      VALUES (${`l1_${Date.now()}`}, ${t1Id}, '[00:01.00] You were the shadow to my light', 0, 0.98)
    `);

    // Track 2: Authorized FLAC with plain lyrics
    const t2Id = `track_e2e_2_${Date.now()}`;
    await db.query(sql`
      INSERT INTO download_tracks (
        id, job_id, video_id, title, artist, album, playlist_position, playlist_track_number,
        album_track_number, audio_provider, audio_format, download_status, match_outcome, local_file_path
      ) VALUES (
        ${t2Id}, ${testJobId}, 'vid_2', 'Mini World', 'Indila', 'Mini World', 1, 2,
        2, 'jamendo', 'flac', 'COMPLETED', 'HIGH_CONFIDENCE', ${flacFile}
      )
    `);
    await db.query(sql`
      INSERT INTO download_files (id, track_id, file_type, file_path, file_name, file_size)
      VALUES (${`f2_${Date.now()}`}, ${t2Id}, 'audio', ${flacFile}, 'source_flac.flac', ${fs.statSync(flacFile).size})
    `);
    await db.query(sql`
      INSERT INTO lyrics_metadata (id, track_id, plain_lyrics, instrumental, match_confidence)
      VALUES (${`l2_${Date.now()}`}, ${t2Id}, 'Mon monde est si petit', 0, 0.95)
    `);

    // Track 3: Authorized OGG
    const t3Id = `track_e2e_3_${Date.now()}`;
    await db.query(sql`
      INSERT INTO download_tracks (
        id, job_id, video_id, title, artist, album, playlist_position, playlist_track_number,
        album_track_number, audio_provider, audio_format, download_status, match_outcome, local_file_path
      ) VALUES (
        ${t3Id}, ${testJobId}, 'vid_3', 'Night Owl', 'Galactic', 'Cosmic', 2, 3,
        null, 'jamendo', 'ogg', 'COMPLETED', 'HIGH_CONFIDENCE', ${oggFile}
      )
    `);
    await db.query(sql`
      INSERT INTO download_files (id, track_id, file_type, file_path, file_name, file_size)
      VALUES (${`f3_${Date.now()}`}, ${t3Id}, 'audio', ${oggFile}, 'source_ogg.ogg', ${fs.statSync(oggFile).size})
    `);

    // Track 4: REJECTED / UNVERIFIED RIGHTS Internet Archive candidate
    const t4Id = `track_e2e_4_${Date.now()}`;
    await db.query(sql`
      INSERT INTO download_tracks (
        id, job_id, video_id, title, artist, album, playlist_position, playlist_track_number,
        album_track_number, audio_provider, audio_format, download_status, match_outcome, rights_status, local_file_path
      ) VALUES (
        ${t4Id}, ${testJobId}, 'vid_4', 'Commercial Song', 'Famous Popstar', 'Greatest Hits', 3, 4,
        null, 'internet_archive', 'mp3', 'COMPLETED', 'NEEDS_REVIEW', 'UNSUPPORTED_CC_CLAIM', ${iaFile}
      )
    `);
    await db.query(sql`
      INSERT INTO download_files (id, track_id, file_type, file_path, file_name, file_size)
      VALUES (${`f4_${Date.now()}`}, ${t4Id}, 'audio', ${iaFile}, 'source_unverified_ia.mp3', ${fs.statSync(iaFile).size})
    `);

    // Generate ZIP archive buffer
    console.log('  Generating ZIP package for test job...');
    const chunks = [];
    const mockRes = new (require('stream').Writable)({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      }
    });
    mockRes.setHeader = () => {};
    mockRes.status = (code) => {
      mockRes.statusCode = code;
      return mockRes;
    };
    mockRes.json = (data) => { mockRes.data = data; };

    await zipExportService.streamJobZip(testJobId, mockRes);
    const zipBuffer = Buffer.concat(chunks);
    assert(zipBuffer.length > 0, `Generated ZIP buffer (${zipBuffer.length} bytes)`);

    const zipFilePath = path.join(testDir, 'export_test.zip');
    fs.writeFileSync(zipFilePath, zipBuffer);

    // Extract ZIP into a brand new directory
    const extractDir = path.join(testDir, 'extracted_zip');
    fs.mkdirSync(extractDir, { recursive: true });

    console.log('  Extracting ZIP archive using PowerShell Expand-Archive...');
    execSync(`powershell -Command "Expand-Archive -Path '${zipFilePath}' -DestinationPath '${extractDir}' -Force"`);

    // Verify all expected files exist
    const expectedFiles = [
      'manifest.json',
      'track_status_report.json',
      'metadata_summary.json',
      'playlist.m3u8',
      'report.txt',
      'Music/Alan Walker/Different World/01 - Faded.mp3',
      'Music/Alan Walker/Different World/01 - Faded.lrc',
      'Music/Alan Walker/Different World/cover.jpg',
      'Music/Indila/Mini World/02 - Mini World.flac',
      'Music/Indila/Mini World/02 - Mini World.txt',
      'Music/Indila/Mini World/cover.jpg',
      'Music/Galactic/Cosmic/03 - Night Owl.ogg',
      'Music/Galactic/Cosmic/cover.jpg',
    ];

    for (const rel of expectedFiles) {
      const full = path.join(extractDir, rel);
      assert(fs.existsSync(full), `Extracted ZIP contains expected file: ${rel}`);
    }

    // Verify SHA-256 Checksums for audio files where they should match originals
    const extractedMp3 = path.join(extractDir, 'Music/Alan Walker/Different World/01 - Faded.mp3');
    assert(sha256(extractedMp3) === sha256(mp3File), 'MP3 SHA-256 checksum matches original exactly');

    const extractedFlac = path.join(extractDir, 'Music/Indila/Mini World/02 - Mini World.flac');
    assert(sha256(extractedFlac) === sha256(flacFile), 'FLAC SHA-256 checksum matches original exactly');

    const extractedOgg = path.join(extractDir, 'Music/Galactic/Cosmic/03 - Night Owl.ogg');
    assert(sha256(extractedOgg) === sha256(oggFile), 'OGG SHA-256 checksum matches original exactly');

    // Parse all JSON manifests
    const manifest = JSON.parse(fs.readFileSync(path.join(extractDir, 'manifest.json'), 'utf8'));
    assert(manifest.totalTracks === 4, 'manifest.json records totalTracks = 4');
    assert(manifest.exportedAudioTracks === 3, 'manifest.json records exportedAudioTracks = 3 (Track 4 excluded)');

    const statusReport = JSON.parse(fs.readFileSync(path.join(extractDir, 'track_status_report.json'), 'utf8'));
    const statusTracks = Array.isArray(statusReport) ? statusReport : statusReport.tracks;
    assert(statusTracks.length === 4, 'track_status_report.json lists all 4 tracks');
    assert(statusTracks[0].playlist_position === 0, 'track 1 playlist_position is 0');
    assert(statusTracks[0].playlist_track_number === 1, 'track 1 playlist_track_number is 1');
    assert(statusTracks[0].album_track_number === 1, 'track 1 album_track_number is 1');
    assert(statusTracks[3].audioExportStatus === 'EXCLUDED_UNVERIFIED_RIGHTS', 'Track 4 has status EXCLUDED_UNVERIFIED_RIGHTS');
    assert(statusTracks[3].exclusionReason.includes('Creative Commons assertions'), 'Track 4 explains exclusion reason');

    const metaSummary = JSON.parse(fs.readFileSync(path.join(extractDir, 'metadata_summary.json'), 'utf8'));
    assert(metaSummary.formatsSummary.mp3 === 1, 'metadata_summary.json counts 1 MP3');
    assert(metaSummary.formatsSummary.flac === 1, 'metadata_summary.json counts 1 FLAC');
    assert(metaSummary.formatsSummary.ogg === 1, 'metadata_summary.json counts 1 OGG');

    // Validate playlist.m3u8 paths
    const m3uContent = fs.readFileSync(path.join(extractDir, 'playlist.m3u8'), 'utf8');
    assert(m3uContent.includes('Music/Alan Walker/Different World/01 - Faded.mp3'), 'm3u8 links to Faded.mp3');
    assert(m3uContent.includes('Music/Indila/Mini World/02 - Mini World.flac'), 'm3u8 links to Mini World.flac');
    assert(m3uContent.includes('Music/Galactic/Cosmic/03 - Night Owl.ogg'), 'm3u8 links to Night Owl.ogg');

    // CRITICAL: Confirm rejected and unauthorized audio candidate is STRICTLY ABSENT
    const unverifiedCandidatePath = path.join(extractDir, 'Music/Famous Popstar/Greatest Hits/04 - Commercial Song.mp3');
    assert(!fs.existsSync(unverifiedCandidatePath), 'STRICT ENFORCEMENT: Unverified/rejected audio candidate is ABSENT from extracted ZIP');
  } catch (err) {
    console.error('  ❌ ZIP archive verification error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 4: Snapshot Verification (176 vs 181 Tracks) ──────────────────────
  console.log('--- Test 4: Independent Snapshot Verification ---');
  try {
    const snap176 = await snapshotService.getSnapshot('snapshot_PLMeZARHzcGt0_v1_176');
    assert(snap176 !== null, 'Snapshot 176 loaded successfully');
    assert(snap176.trackCount === 176, `Snapshot 176 trackCount is 176 (got ${snap176.trackCount})`);
    assert(snap176.tracks.length === 176, `Snapshot 176 tracks array has 176 items (got ${snap176.tracks.length})`);

    // Verify positions are 0..175 continuous
    const positions176 = snap176.tracks.map(t => t.position);
    assert(positions176[0] === 0, 'Snapshot 176 starts at position 0');
    assert(positions176[175] === 175, 'Snapshot 176 ends at position 175');
    assert(snap176.tracks.every(t => t.videoId && t.title && t.artist), 'Every track in Snapshot 176 has videoId, title, and artist');

    const snap181 = await snapshotService.getSnapshot('snapshot_PLMeZARHzcGt0_v2_181');
    assert(snap181 !== null, 'Snapshot 181 loaded successfully');
    assert(snap181.trackCount === 181, `Snapshot 181 trackCount is 181 (got ${snap181.trackCount})`);
    assert(snap181.tracks.length === 181, `Snapshot 181 tracks array has 181 items (got ${snap181.tracks.length})`);

    const positions181 = snap181.tracks.map(t => t.position);
    assert(positions181[0] === 0, 'Snapshot 181 starts at position 0');
    assert(positions181[180] === 180, 'Snapshot 181 ends at position 180');
    assert(snap181.tracks.every(t => t.videoId && t.title && t.artist), 'Every track in Snapshot 181 has videoId, title, and artist');

    // Confirm snapshots are independent and non-identical
    assert(snap176.id !== snap181.id, 'Snapshots have distinct unique IDs');
    assert(snap176.trackCount !== snap181.trackCount, 'Snapshots preserve distinct track counts');
  } catch (err) {
    console.error('  ❌ Snapshot verification error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 5: API Error Handling Verification ───────────────────────────────
  console.log('--- Test 5: /api/library API Endpoints & Error Handling ---');
  try {
    // 1. GET /api/library/snapshots
    const snapListRes = await axios.get(`${API_URL}/api/library/snapshots`);
    assert(snapListRes.status === 200, 'GET /api/library/snapshots returns 200');
    assert(snapListRes.data.snapshots.length >= 2, 'Lists registered snapshots');

    // 2. GET /api/library/snapshots/:id with invalid ID
    try {
      await axios.get(`${API_URL}/api/library/snapshots/non_existent_snapshot_id_xyz`);
      assert(false, 'Expected 404 for invalid snapshot ID');
    } catch (err) {
      assert(err.response?.status === 404, 'GET /api/library/snapshots/:id returns 404 for invalid ID');
    }

    // 3. POST /api/library/tag with missing filePath
    try {
      await axios.post(`${API_URL}/api/library/tag`, { tags: { title: 'No Path' } });
      assert(false, 'Expected 400 for missing filePath');
    } catch (err) {
      assert(err.response?.status === 400, 'POST /api/library/tag returns 400 when filePath is missing');
    }

    // 4. POST /api/library/tag with non-existent file
    try {
      await axios.post(`${API_URL}/api/library/tag`, { filePath: 'C:/fake/path/does_not_exist.mp3', tags: {} });
      assert(false, 'Expected 404 for non-existent file');
    } catch (err) {
      assert(err.response?.status === 404, 'POST /api/library/tag returns 404 when file does not exist');
    }

    // 5. POST /api/library/tag with invalid audio format
    const fakeTextFile = path.join(testDir, 'fake.txt');
    fs.writeFileSync(fakeTextFile, 'not an audio file');
    try {
      await axios.post(`${API_URL}/api/library/tag`, { filePath: fakeTextFile, tags: {} });
      assert(false, 'Expected 400 for unsupported audio format');
    } catch (err) {
      assert(err.response?.status === 400, 'POST /api/library/tag returns 400 for unsupported audio format (.txt)');
    }

    // 6. POST /api/library/tag with prohibited lossy-to-lossless conversion claim
    const sampleMp3 = path.join(testDir, 'sample_lossy.mp3');
    fs.writeFileSync(sampleMp3, audioTaggingService.createTestMp3Buffer());
    try {
      await axios.post(`${API_URL}/api/library/tag`, { filePath: sampleMp3, tags: { targetFormat: 'flac' } });
      assert(false, 'Expected 400 for prohibited lossy-to-lossless claim');
    } catch (err) {
      assert(err.response?.status === 400, 'POST /api/library/tag returns 400 when attempting lossy-to-FLAC conversion claim');
    }

    // 7. POST /api/library/artwork/validate with valid artwork
    const testJpg = artworkService.createTestJpegBuffer(400, 400);
    const validArtRes = await axios.post(`${API_URL}/api/library/artwork/validate`, {
      artworkBase64: testJpg.toString('base64'),
    });
    assert(validArtRes.status === 200 && validArtRes.data.valid === true, 'POST /api/library/artwork/validate returns 200 for valid JPEG');

    // 8. POST /api/library/artwork/validate with invalid buffer
    try {
      await axios.post(`${API_URL}/api/library/artwork/validate`, {
        artworkBase64: Buffer.from('corrupt_binary_data').toString('base64'),
      });
      assert(false, 'Expected 400 for corrupt artwork buffer');
    } catch (err) {
      assert(err.response?.status === 400, 'POST /api/library/artwork/validate returns 400 for invalid/corrupt image buffer');
    }

    // 9. POST /api/library/artwork/validate with untrusted domain
    try {
      await axios.post(`${API_URL}/api/library/artwork/validate`, {
        url: 'https://shady-unauthorized-art.com/pic.jpg',
      });
      assert(false, 'Expected 400 for untrusted artwork URL domain');
    } catch (err) {
      assert(err.response?.status === 400, 'POST /api/library/artwork/validate returns 400 for unauthorized artwork domain');
    }

    // 10. GET /api/library/jobs/:jobId/export with non-existent job ID
    try {
      await axios.get(`${API_URL}/api/library/jobs/non_existent_job_123/export`);
      assert(false, 'Expected 404 for non-existent job export');
    } catch (err) {
      assert(err.response?.status === 404, 'GET /api/library/jobs/:jobId/export returns 404 for non-existent job ID');
    }

    // 11. GET /api/library/jobs/:jobId/export with empty job (0 tracks)
    const emptyJobId = `job_empty_${Date.now()}`;
    const db = getDB();
    await db.query(sql`
      INSERT INTO download_jobs (id, playlist_id, playlist_title, total_tracks, completed_tracks, status, created_at)
      VALUES (${emptyJobId}, 'PL_empty', 'Empty Playlist', 0, 0, 'COMPLETED', ${Math.floor(Date.now() / 1000)})
    `);
    try {
      await axios.get(`${API_URL}/api/library/jobs/${emptyJobId}/export`);
      assert(false, 'Expected 400 for empty job export');
    } catch (err) {
      assert(err.response?.status === 400, 'GET /api/library/jobs/:jobId/export returns 400 for job with 0 tracks');
    }
  } catch (err) {
    console.error('  ❌ API error handling verification error:', err.message);
    failed++;
  }
  console.log();

  // Cleanup test directory
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {}

  console.log('================================================================');
  console.log(`🧪 PHASE 4.1 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase41Tests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
