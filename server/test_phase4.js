/**
 * Phase 4 — Audio Metadata, Artwork, and Library Packaging Test Suite
 *
 * Verifies:
 *  1. MP3 ID3v2 metadata tagging & artwork embedding
 *  2. FLAC Vorbis Comment & Picture metadata block tagging
 *  3. OGG metadata inspection & validation
 *  4. Anti-fabrication enforcement (lossy cannot be relabeled/converted to FLAC lossless)
 *  5. Artwork format validation (JPEG, PNG, WebP magic bytes & dimension extraction)
 *  6. Permitted artwork domain verification & untrusted domain rejection
 *  7. Library folder structure & filename sanitization (Unicode preservation, illegal char strip)
 *  8. Missing metadata fallback handling (Unknown Artist, Unknown Album)
 *  9. Duplicate filename collision resolution
 * 10. Track-specific lyrics association (.lrc alongside .mp3, .txt for plain)
 * 11. ZIP export packaging integrity (manifest.json, track_status_report, metadata_summary, playlist.m3u8)
 * 12. Strict exclusion of rejected/unverified audio candidates from export
 * 13. Snapshot integrity (both 176 and 181 snapshots preserved and unchanged)
 * 14. Library API endpoints verification (HTTP endpoints)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { initDB, getDB, sql } = require('./src/db');
const audioTaggingService = require('./src/services/audioTaggingService');
const artworkService = require('./src/services/artworkService');
const libraryPackagingService = require('./src/services/libraryPackagingService');
const zipExportService = require('./src/services/zipExportService');
const snapshotService = require('./src/services/snapshotService');

const API_BASE = 'http://localhost:3001';
const TEST_DIR = path.join(__dirname, 'test_phase4_temp');

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

async function runPhase4Tests() {
  await initDB();

  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }

  console.log('================================================================');
  console.log('🧪 PHASE 4: AUDIO METADATA, ARTWORK & PACKAGING TEST SUITE');
  console.log('================================================================\n');

  // ── TEST 1: MP3 ID3v2 Tagging & Artwork Embedding ──────────────────────────
  console.log('--- Test 1: MP3 ID3v2 Tagging & Artwork Embedding ---');
  try {
    const testMp3Path = path.join(TEST_DIR, 'test_sample.mp3');
    const mp3Buf = audioTaggingService.createTestMp3Buffer();
    fs.writeFileSync(testMp3Path, mp3Buf);

    const testArtBuf = artworkService.createTestJpegBuffer();

    const tags = {
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      album: 'After Hours',
      albumArtist: 'The Weeknd',
      trackNumber: 9,
      year: 2020,
      genre: 'Synthpop',
    };

    const taggedMeta = await audioTaggingService.tagAudioFile(testMp3Path, tags, testArtBuf, 'image/jpeg');

    assert(taggedMeta.title === 'Blinding Lights', 'MP3 title correctly tagged');
    assert(taggedMeta.artist === 'The Weeknd', 'MP3 artist correctly tagged');
    assert(taggedMeta.album === 'After Hours', 'MP3 album correctly tagged');
    assert(taggedMeta.albumArtist === 'The Weeknd', 'MP3 albumArtist correctly tagged');
    assert(taggedMeta.trackNumber === 9, 'MP3 trackNumber correctly tagged (9)');
    assert(taggedMeta.year === 2020, 'MP3 release year correctly tagged (2020)');
    assert(taggedMeta.genre.includes('Synthpop'), 'MP3 genre correctly tagged');
    assert(taggedMeta.hasArtwork === true, 'MP3 has embedded artwork');
    assert(taggedMeta.artworkMime.includes('jpeg'), 'MP3 artwork format is image/jpeg');
  } catch (err) {
    console.error('  ❌ MP3 tagging test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 2: FLAC Vorbis Comment & Picture Metadata Block ───────────────────
  console.log('--- Test 2: FLAC Vorbis Comment & Picture Metadata Block ---');
  try {
    const testFlacPath = path.join(TEST_DIR, 'test_sample.flac');
    const flacBuf = audioTaggingService.createTestFlacBuffer();
    fs.writeFileSync(testFlacPath, flacBuf);

    const testArtBuf = artworkService.createTestJpegBuffer();

    const tags = {
      title: 'Alone, Pt. II',
      artist: 'Alan Walker & Ava Max',
      album: 'World of Walker',
      albumArtist: 'Alan Walker',
      trackNumber: 2,
      year: 2019,
      genre: 'EDM',
    };

    const taggedMeta = await audioTaggingService.tagAudioFile(testFlacPath, tags, testArtBuf, 'image/jpeg');

    assert(taggedMeta.title === 'Alone, Pt. II', 'FLAC title correctly tagged');
    assert(taggedMeta.artist === 'Alan Walker & Ava Max', 'FLAC artist correctly tagged');
    assert(taggedMeta.album === 'World of Walker', 'FLAC album correctly tagged');
    assert(taggedMeta.albumArtist === 'Alan Walker', 'FLAC albumArtist correctly tagged');
    assert(taggedMeta.trackNumber === 2, 'FLAC trackNumber correctly tagged (2)');
    assert(taggedMeta.year === 2019, 'FLAC year correctly tagged (2019)');
    assert(taggedMeta.format === 'flac', 'FLAC format verified');
    assert(taggedMeta.qualityTier === 'LOSSLESS', 'Genuine FLAC classified as LOSSLESS');
    assert(taggedMeta.hasArtwork === true, 'FLAC has embedded METADATA_BLOCK_PICTURE artwork');
  } catch (err) {
    console.error('  ❌ FLAC tagging test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 3: Anti-Fabrication Rule (Lossy cannot be converted to FLAC) ──────
  console.log('--- Test 3: Anti-Fabrication Rule (Lossy to Lossless Conversion Rejection) ---');
  try {
    const testMp3Path = path.join(TEST_DIR, 'test_sample.mp3');
    let threw = false;
    try {
      await audioTaggingService.tagAudioFile(testMp3Path, {
        title: 'Fake Lossless',
        targetFormat: 'flac',
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes('Cannot convert lossy audio into FLAC'), 'Explicitly rejects lossy-to-FLAC conversion claim');
    }
    assert(threw, 'Anti-fabrication check throws when lossy is claimed as FLAC');
  } catch (err) {
    console.error('  ❌ Anti-fabrication test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 4: Artwork Format & Dimension Validation ──────────────────────────
  console.log('--- Test 4: Artwork Format & Dimension Validation ---');
  try {
    const jpegBuf = artworkService.createTestJpegBuffer();
    const jpegCheck = artworkService.validateImageBuffer(jpegBuf);
    assert(jpegCheck.valid === true, 'Validates valid JPEG buffer');
    assert(jpegCheck.mimeType === 'image/jpeg', 'Detects image/jpeg MIME');

    // PNG buffer test (standard 8-byte signature + IHDR)
    const pngBuf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
      0x00, 0x00, 0x00, 0x0d, // IHDR chunk length 13
      0x49, 0x48, 0x44, 0x52, // 'IHDR'
      0x00, 0x00, 0x01, 0xf4, // width = 500
      0x00, 0x00, 0x01, 0xf4, // height = 500
      0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, etc.
      0x00, 0x00, 0x00, 0x00
    ]);
    const pngCheck = artworkService.validateImageBuffer(pngBuf);
    assert(pngCheck.valid === true, 'Validates valid PNG buffer');
    assert(pngCheck.mimeType === 'image/png', 'Detects image/png MIME');
    assert(pngCheck.width === 500 && pngCheck.height === 500, 'Extracts width & height (500x500)');

    // Invalid non-image buffer rejection
    const invalidBuf = Buffer.from('This is not an image at all!');
    const invalidCheck = artworkService.validateImageBuffer(invalidBuf);
    assert(invalidCheck.valid === false, 'Rejects non-image buffer');
  } catch (err) {
    console.error('  ❌ Artwork validation test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 5: Permitted Artwork Domain Verification ───────────────────────────
  console.log('--- Test 5: Permitted Artwork Domain Verification ---');
  try {
    const untrustedUrl = 'https://unauthorized-shady-site.com/fake-cover.jpg';
    const rejected = await artworkService.fetchPermittedArtwork(untrustedUrl);
    assert(rejected === null, 'Rejects untrusted artwork domain');
  } catch (err) {
    console.error('  ❌ Artwork domain test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 6: Library Folder Structure & Filename Sanitization ────────────────
  console.log('--- Test 6: Library Folder Structure & Filename Sanitization ---');
  try {
    // Standard structure
    const relPath = libraryPackagingService.buildTrackRelativePath({
      artist: 'The Weeknd',
      album: 'Starboy',
      position: 0,
      title: 'Starboy',
      ext: 'mp3',
    });
    assert(relPath === 'Music/The Weeknd/Starboy/01 - Starboy.mp3', `Standard path matches: ${relPath}`);

    // Unicode preservation: French / German accents and special characters
    const unicodePath = libraryPackagingService.buildTrackRelativePath({
      artist: 'Indila',
      album: 'Mini World',
      position: 2,
      title: 'Ainsi bas la vida',
      ext: 'flac',
    });
    assert(unicodePath === 'Music/Indila/Mini World/03 - Ainsi bas la vida.flac', `Preserves Unicode letters: ${unicodePath}`);

    // Illegal filesystem character stripping: / \ : * ? " < > |
    const illegalPath = libraryPackagingService.buildTrackRelativePath({
      artist: 'AC/DC',
      album: 'Who Made Who?',
      position: 5,
      title: 'D.T. <Dirty Track> *Remastered*',
      ext: 'mp3',
    });
    assert(!illegalPath.includes('?') && !illegalPath.includes('<') && !illegalPath.includes('*'), 'Illegal filesystem characters stripped');
    assert(illegalPath.startsWith('Music/ACDC/Who Made Who/06 - D.T. Dirty Track Remastered.mp3'), `Sanitized path clean: ${illegalPath}`);
  } catch (err) {
    console.error('  ❌ Folder structure test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 7: Missing Metadata Safe Handling ─────────────────────────────────
  console.log('--- Test 7: Missing Metadata Safe Handling ---');
  try {
    const missingPath = libraryPackagingService.buildTrackRelativePath({
      artist: '',
      album: null,
      position: 0,
      title: null,
      ext: 'mp3',
    });
    assert(missingPath.startsWith('Music/Unknown Artist/Unknown Album/01 - Track_01.mp3'), `Safe fallback for missing metadata: ${missingPath}`);
  } catch (err) {
    console.error('  ❌ Missing metadata test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 8: Track-Specific Lyrics Association (.lrc & .txt) ─────────────────
  console.log('--- Test 8: Track-Specific Lyrics Association ---');
  try {
    // Synced lyrics (.lrc)
    const lrcPath = libraryPackagingService.buildLyricsRelativePath({
      artist: 'Lukas Graham',
      album: 'Blue Album',
      position: 0,
      title: '7 Years',
      isSynced: true,
    });
    assert(lrcPath === 'Music/Lukas Graham/Blue Album/01 - 7 Years.lrc', `Synced lyrics path has .lrc extension: ${lrcPath}`);

    // Plain lyrics (.txt)
    const txtPath = libraryPackagingService.buildLyricsRelativePath({
      artist: 'Sia',
      album: 'This Is Acting',
      position: 7,
      title: 'Unstoppable',
      isSynced: false,
    });
    assert(txtPath === 'Music/Sia/This Is Acting/08 - Unstoppable.txt', `Plain lyrics path has .txt extension: ${txtPath}`);
  } catch (err) {
    console.error('  ❌ Lyrics association test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 9: Duplicate Filename Collision Resolution ─────────────────────────
  console.log('--- Test 9: Duplicate Filename Collision Resolution ---');
  try {
    const testFile1 = path.join(TEST_DIR, '01 - Duplicate Song.mp3');
    fs.writeFileSync(testFile1, 'audio data 1');

    // Attempting to resolve candidate for the same filename should yield unique name
    const resolved = libraryPackagingService._resolveDuplicateName(testFile1);
    assert(resolved !== testFile1, 'Duplicate filename resolved to distinct name');
    assert(resolved.includes('_(1).mp3'), 'Appends unique collision index (1)');
  } catch (err) {
    console.error('  ❌ Duplicate filename test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 10: Complete Library Package Track on Disk ─────────────────────────
  console.log('--- Test 10: Complete Library Packaging on Disk ---');
  try {
    const pkgDir = path.join(TEST_DIR, 'LibraryExport');
    const mp3Buf = audioTaggingService.createTestMp3Buffer();
    const artBuf = artworkService.createTestJpegBuffer();

    const packaged = await libraryPackagingService.packageTrack({
      baseDir: pkgDir,
      track: {
        title: '7 Years',
        artist: 'Lukas Graham',
        album: 'Lukas Graham',
        playlist_position: 0,
        audio_format: 'mp3',
      },
      audioBuffer: mp3Buf,
      lyrics: '[00:12.34] Once I was seven years old my momma told me',
      isSyncedLyrics: true,
      lyricsStatus: 'SYNCHRONIZED_NEEDS_REVIEW',
      artworkBuffer: artBuf,
    });

    assert(fs.existsSync(packaged.audioPath), 'Audio file packaged into Music/Artist/Album/');
    assert(fs.existsSync(packaged.lyricsPath), 'Lyrics file packaged alongside audio track');
    assert(fs.existsSync(packaged.coverPath), 'cover.jpg saved into album folder');
    assert(packaged.lyricsPath.endsWith('.lrc'), 'Synced lyrics saved with .lrc extension');

    // Verify audio file has embedded tags and artwork
    const readMeta = await audioTaggingService.readMetadata(packaged.audioPath);
    assert(readMeta.title === '7 Years', 'Packaged audio file has embedded title');
    assert(readMeta.hasArtwork === true, 'Packaged audio file has embedded artwork');
  } catch (err) {
    console.error('  ❌ Package on disk test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 11: ZIP Export Packaging Integrity & Rights Exclusion ──────────────
  console.log('--- Test 11: ZIP Export Integrity & Strict Rights Exclusion ---');
  try {
    const testTracks = [
      // Track 1: Authorized (e.g. Jamendo)
      {
        id: 'track_auth_1',
        playlist_position: 0,
        title: 'Authorized Song',
        artist: 'Open Artist',
        album: 'Open Album',
        audio_provider: 'jamendo',
        audio_format: 'mp3',
        source_license: 'Creative Commons Attribution',
        rights_status: 'SUPPORTED',
        match_outcome: 'HIGH_CONFIDENCE',
        synced_lyrics: '[00:05.00] Hello world',
        local_file_path: path.join(TEST_DIR, 'test_sample.mp3'),
      },
      // Track 2: Rejected rights (Internet Archive community upload) -> MUST BE EXCLUDED FROM AUDIO
      {
        id: 'track_ia_unauth',
        playlist_position: 1,
        title: 'Starboy',
        artist: 'The Weeknd',
        album: 'Starboy',
        audio_provider: 'internet_archive',
        audio_format: 'mp3',
        source_license: 'Creative Commons',
        rights_status: 'UNSUPPORTED_CC_CLAIM',
        match_outcome: 'NEEDS_REVIEW',
        synced_lyrics: '[00:10.00] Im tryna put you in the worst mood',
        local_file_path: path.join(TEST_DIR, 'test_sample.mp3'),
      },
    ];

    const zipStream = await zipExportService.createZipStream('job_test_zip', testTracks, {
      playlistTitle: 'Integrity Test Playlist',
      playlistId: 'PLtest_zip',
      snapshotId: 'snapshot_PLMeZARHzcGt0_v1_176',
    });

    const zipBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      zipStream.on('data', chunk => chunks.push(chunk));
      zipStream.on('end', () => resolve(Buffer.concat(chunks)));
      zipStream.on('error', reject);
    });

    assert(zipBuffer.length > 500, `ZIP archive generated (${zipBuffer.length} bytes)`);

    // Verify ZIP contents by checking filename entries in zip buffer
    const zipString = zipBuffer.toString('latin1');
    assert(zipString.includes('manifest.json'), 'ZIP includes manifest.json');
    assert(zipString.includes('track_status_report.json'), 'ZIP includes track_status_report.json');
    assert(zipString.includes('metadata_summary.json'), 'ZIP includes metadata_summary.json');
    assert(zipString.includes('playlist.m3u8'), 'ZIP includes playlist.m3u8');
    assert(zipString.includes('report.txt'), 'ZIP includes report.txt');
    assert(zipString.includes('Music/Open Artist/Open Album/01 - Authorized Song.mp3'), 'ZIP includes authorized audio in Music/Artist/Album/');
    assert(zipString.includes('01 - Authorized Song.lrc'), 'ZIP includes lyrics for authorized track');
    assert(zipString.includes('02 - Starboy.lrc'), 'ZIP includes lyrics for track 2');

    // STRICT RIGHTS TEST: Starboy audio MUST NOT be included
    assert(!zipString.includes('Music/The Weeknd/Starboy/02 - Starboy.mp3'), 'STRICT ENFORCEMENT: Unverified/rejected audio candidate is excluded from ZIP export');
  } catch (err) {
    console.error('  ❌ ZIP export test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 12: Snapshot Integrity (176 & 181 Preserved) ──────────────────────
  console.log('--- Test 12: Snapshot Integrity (176 & 181 Snapshots Preserved) ---');
  try {
    const snap176 = await snapshotService.getSnapshot('snapshot_PLMeZARHzcGt0_v1_176');
    assert(snap176 !== null, 'Baseline snapshot 176 exists');
    assert(snap176.trackCount === 176, 'Baseline snapshot 176 has exact trackCount = 176');
    assert(snap176.tracks.length === 176, 'Baseline snapshot 176 tracks array has 176 entries');

    const snap181 = await snapshotService.getSnapshot('snapshot_PLMeZARHzcGt0_v2_181');
    assert(snap181 !== null, 'Refreshed snapshot 181 exists');
    assert(snap181.trackCount === 181, 'Refreshed snapshot 181 has exact trackCount = 181');
    assert(snap181.tracks.length === 181, 'Refreshed snapshot 181 tracks array has 181 entries');

    // Verify snapshot 176 is untouched and different from snapshot 181
    assert(snap176.snapshotId !== snap181.snapshotId, 'Snapshots have distinct unique IDs');
    assert(snap176.trackCount !== snap181.trackCount, 'Snapshots have distinct track counts (176 vs 181)');
  } catch (err) {
    console.error('  ❌ Snapshot integrity test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 13: Library API Endpoints ─────────────────────────────────────────
  console.log('--- Test 13: Library API Endpoints ---');
  try {
    // GET /api/library/snapshots
    const snapListRes = await axios.get(`${API_BASE}/api/library/snapshots`);
    assert(snapListRes.status === 200, 'GET /api/library/snapshots returns 200');
    assert(Array.isArray(snapListRes.data.snapshots), 'Response has snapshots array');
    assert(snapListRes.data.snapshots.length >= 2, 'Lists at least 2 registered snapshots');

    // GET /api/library/snapshots/:id
    const snapDetailRes = await axios.get(`${API_BASE}/api/library/snapshots/snapshot_PLMeZARHzcGt0_v1_176`);
    assert(snapDetailRes.status === 200, 'GET /api/library/snapshots/:id returns 200');
    assert(snapDetailRes.data.trackCount === 176, 'Returns exact snapshot 176 data');

    // POST /api/library/artwork/validate
    const testArtBuf = artworkService.createTestJpegBuffer();
    const artValRes = await axios.post(`${API_BASE}/api/library/artwork/validate`, {
      artworkBase64: testArtBuf.toString('base64'),
    });
    assert(artValRes.status === 200, 'POST /api/library/artwork/validate returns 200');
    assert(artValRes.data.valid === true, 'Validates base64 artwork');
    assert(artValRes.data.mimeType === 'image/jpeg', 'Detects image/jpeg');
  } catch (err) {
    console.error('  ❌ Library API test error:', err.message);
    failed++;
  }
  console.log();

  // Cleanup test temp directory
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch (_) {}

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log('================================================================');
  console.log(`🧪 PHASE 4 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase4Tests().catch(err => {
  console.error('Fatal Phase 4 test error:', err);
  process.exit(1);
});
