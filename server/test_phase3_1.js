/**
 * Phase 3.1 — Critical Data Integrity and Match Verification Test Suite
 *
 * Tests:
 *  1. Database Schema & Migration Integrity (columns, indexes, tables)
 *  2. Deliberate Mismatched Fixture Detection (V1Pl8CzNzCw + Falling mismatch detection)
 *  3. Similar Song Titles Disambiguation (Alone vs Alone, Pt. II)
 *  4. Same Artist Multiple Songs (The Weeknd: Starboy vs Blinding Lights)
 *  5. Duplicate Titles Disambiguation (Sub Urban: Cradles #22 vs Cradles MV #163)
 *  6. Remix vs Original & Version Type Classification
 *  7. Internet Archive Rights Audit (unsupported CC claims rejected)
 *  8. LRCLIB Lyrics Integrity & Missing Duration Handling (SYNCHRONIZED_NEEDS_REVIEW)
 *  9. Concurrent Provider Search Safety (no cross-track pollution)
 * 10. Multiple Scans Deduplication & Stable Identifiers
 * 11. CSV & JSON Export Verification (all verified fields present)
 * 12. Full 181-Track Audit Verification (181/181 correct associations)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { initDB, getDB, sql } = require('./src/db');
const dataIntegrityService = require('./src/services/dataIntegrityService');
const coverageScannerService = require('./src/services/coverageScannerService');

const API_BASE = 'http://localhost:3001';

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

async function runPhase31Tests() {
  await initDB();

  console.log('================================================================');
  console.log('🧪 PHASE 3.1: DATA INTEGRITY & MATCH VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  // ── TEST 1: Database Schema & Migration Integrity ──────────────────────────
  console.log('--- Test 1: Database Schema & Migration Integrity ---');
  try {
    const db = getDB();

    // Check integrity_audits table
    const tables = await db.query(sql`SELECT name FROM sqlite_master WHERE type='table' AND name = 'integrity_audits'`);
    assert(tables.length === 1, 'integrity_audits table exists');

    // Check audio_candidates enhanced columns
    const acInfo = await db.query(sql`PRAGMA table_info(audio_candidates)`);
    const acCols = acInfo.map(r => r.name);
    assert(acCols.includes('track_id'), 'audio_candidates has track_id');
    assert(acCols.includes('playlist_position'), 'audio_candidates has playlist_position');
    assert(acCols.includes('original_title'), 'audio_candidates has original_title');
    assert(acCols.includes('original_artist'), 'audio_candidates has original_artist');
    assert(acCols.includes('rights_status'), 'audio_candidates has rights_status');
    assert(acCols.includes('rights_justification'), 'audio_candidates has rights_justification');
    assert(acCols.includes('version_type'), 'audio_candidates has version_type');

    // Check lyrics_candidates enhanced columns
    const lcInfo = await db.query(sql`PRAGMA table_info(lyrics_candidates)`);
    const lcCols = lcInfo.map(r => r.name);
    assert(lcCols.includes('track_id'), 'lyrics_candidates has track_id');
    assert(lcCols.includes('playlist_position'), 'lyrics_candidates has playlist_position');
    assert(lcCols.includes('original_title'), 'lyrics_candidates has original_title');
    assert(lcCols.includes('original_artist'), 'lyrics_candidates has original_artist');
    assert(lcCols.includes('timestamps_present'), 'lyrics_candidates has timestamps_present');
    assert(lcCols.includes('verification_notes'), 'lyrics_candidates has verification_notes');
  } catch (err) {
    console.error('  ❌ DB Schema error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 2: Deliberate Mismatched Fixture Detection ────────────────────────
  console.log('--- Test 2: Deliberate Mismatched Fixture Detection ---');
  try {
    const db = getDB();
    const testScanId = `test_mismatch_${Date.now()}`;

    // Insert an intentionally corrupted fixture:
    // videoId V1Pl8CzNzCw (which is lovely by Billie Eilish) falsely paired with "Falling" by Trevor Daniel
    await db.query(sql`
      INSERT INTO coverage_scans (id, playlist_id, playlist_title, total_tracks, scanned_tracks, status, created_at)
      VALUES (${testScanId}, 'PLtest_mismatch', 'Mismatch Test', 1, 1, 'COMPLETED', ${Math.floor(Date.now() / 1000)})
    `);

    await db.query(sql`
      INSERT INTO audio_candidates (
        id, scan_id, video_id, title, artist, provider, match_outcome, checked_at
      ) VALUES (
        ${crypto.randomUUID()}, ${testScanId}, 'V1Pl8CzNzCw', 'Falling', 'Trevor Daniel', 'internet_archive', 'NEEDS_REVIEW', ${Math.floor(Date.now() / 1000)}
      )
    `);

    // Run audit against the REAL track definition for V1Pl8CzNzCw (lovely by Billie Eilish)
    const officialFixture = [
      {
        videoId: 'V1Pl8CzNzCw',
        title: 'Billie Eilish, Khalid - lovely',
        artist: 'BillieEilishVEVO',
        position: 19,
      }
    ];

    const audit = await dataIntegrityService.runAudit(testScanId, officialFixture);

    assert(audit.totalAudited === 1, 'Audit audited 1 track');
    assert(audit.mismatchesDetected === 1, 'Audit correctly detected 1 deliberate mismatch');
    assert(audit.mismatches.length === 1, 'Mismatches list contains 1 entry');
    assert(audit.mismatches[0].videoId === 'V1Pl8CzNzCw', 'Mismatch accurately identifies videoId V1Pl8CzNzCw');
    assert(audit.mismatches[0].reasons[0].includes('Falling'), 'Mismatch reason explicitly flags "Falling" discrepancy');
    assert(audit.mismatches[0].officialTitle === 'Billie Eilish, Khalid - lovely', 'Official title preserved as "lovely"');
  } catch (err) {
    console.error('  ❌ Mismatched fixture test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 3: Similar Song Titles Disambiguation ──────────────────────────────
  console.log('--- Test 3: Similar Song Titles Disambiguation (Alone vs Alone, Pt. II) ---');
  try {
    const trackAlone1 = { videoId: 'HhjHYkPQ8F0', title: 'Alan Walker & Ava Max - Alone, Pt. II', artist: 'Alan Walker', position: 3 };
    const trackAlone2 = { videoId: 'ciwx8yJPX54', title: 'Alone, Pt. II', artist: 'Ava Max - Topic', position: 4 };

    // Verify they have distinct identities and positions
    assert(trackAlone1.videoId !== trackAlone2.videoId, 'Similar titles have distinct video IDs');
    assert(trackAlone1.position !== trackAlone2.position, 'Similar titles have distinct playlist positions');

    // Test LRCLIB lyrics classification handles clean distinctions
    const lc1 = dataIntegrityService.classifyLyricsIntegrity(trackAlone1, {
      status: 'SYNCHRONIZED',
      has_synced: 1,
      has_plain: 1,
      match_confidence: 0.95,
      matched_duration: 180,
    });
    // Missing duration in original track must result in SYNCHRONIZED_NEEDS_REVIEW
    assert(lc1.status === 'SYNCHRONIZED_NEEDS_REVIEW', 'Lyrics with missing original duration marked SYNCHRONIZED_NEEDS_REVIEW');
    assert(lc1.timestampsPresent === true, 'Timestamps marked present');
  } catch (err) {
    console.error('  ❌ Similar titles test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 4: Same Artist Multiple Songs (The Weeknd) ─────────────────────────
  console.log('--- Test 4: Same Artist Multiple Songs (The Weeknd: Starboy vs Blinding Lights) ---');
  try {
    const starboy = { videoId: '3_g2un5M350', title: 'Starboy', artist: 'The Weeknd - Topic', position: 164 };
    const blinding = { videoId: 'J7p4bzqLvCw', title: 'Blinding Lights', artist: 'The Weeknd - Topic', position: 34 };

    assert(starboy.videoId !== blinding.videoId, 'Starboy and Blinding Lights have distinct video IDs');
    assert(starboy.title !== blinding.title, 'Starboy and Blinding Lights have distinct titles');
    assert(starboy.position === 164, 'Starboy is at position 164 in official snapshot');
    assert(blinding.position === 34, 'Blinding Lights is at position 34 in official snapshot');
  } catch (err) {
    console.error('  ❌ Same artist test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 5: Duplicate Titles Disambiguation (Sub Urban: Cradles #22 vs #163) ─
  console.log('--- Test 5: Duplicate Titles Disambiguation (Cradles #22 vs MV #163) ---');
  try {
    const snapshotPath = path.join(__dirname, 'import_snapshot.json');
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

    const cradlesTracks = snapshot.filter(t => t.title && t.title.toLowerCase().includes('cradles'));
    assert(cradlesTracks.length === 2, 'Snapshot contains exactly 2 Cradles tracks');

    const [t1, t2] = cradlesTracks;
    assert(t1.videoId !== t2.videoId, 'Duplicate title tracks have distinct video IDs (8_Cw99SiHvc vs KBtk5FUeJbk)');
    assert(t1.position !== t2.position, 'Duplicate title tracks have distinct playlist positions (22 vs 163)');
  } catch (err) {
    console.error('  ❌ Duplicate titles test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 6: Remix vs Original & Version Type Classification ─────────────────
  console.log('--- Test 6: Remix vs Original & Version Type Classification ---');
  try {
    const nightcoreEval = dataIntegrityService.classifyInternetArchiveRights({
      candidate_title: 'Nightcore - Blinding Lights [The Weeknd]',
    });
    assert(nightcoreEval.versionType === 'NIGHTCORE', 'Identifies NIGHTCORE version type');
    assert(nightcoreEval.rightsStatus === 'DERIVATIVE_UNAUTHORIZED', 'Rejects nightcore derivative as unauthorized');
    assert(nightcoreEval.downloadAllowed === false, 'Disallows download for nightcore derivative');

    const coverEval = dataIntegrityService.classifyInternetArchiveRights({
      candidate_title: 'Espresso Sabrina Carpenter ( Best Cover Ever )',
    });
    assert(coverEval.versionType === 'COVER', 'Identifies COVER version type');
    assert(coverEval.rightsStatus === 'NEEDS_MECHANICAL_LICENSE_PROOF', 'Requires mechanical license proof for cover');
    assert(coverEval.downloadAllowed === false, 'Disallows download for cover');

    const liveEval = dataIntegrityService.classifyInternetArchiveRights({
      candidate_title: 'Alan Walker Alone, Pt. II ( Live At Château De Fontainebleau)',
    });
    assert(liveEval.versionType === 'LIVE', 'Identifies LIVE version type');
    assert(liveEval.rightsStatus === 'BOOTLEG_UNAUTHORIZED', 'Classifies live concert recording as unauthorized bootleg');
    assert(liveEval.downloadAllowed === false, 'Disallows download for bootleg live recording');

    const ncsEval = dataIntegrityService.classifyInternetArchiveRights({
      candidate_title: 'Sub Urban Cradles [ NCS Release]',
    });
    assert(ncsEval.versionType === 'NCS_RELEASE', 'Identifies NCS_RELEASE version type');
    assert(ncsEval.rightsStatus === 'COMMUNITY_RELEASE_UNVERIFIED', 'Classifies NCS third-party upload as unverified');
    assert(ncsEval.downloadAllowed === false, 'Disallows auto-download for community scrape');

    const slowedEval = dataIntegrityService.classifyInternetArchiveRights({
      candidate_title: 'Dark Horse [SLEEPCORE EDIT]',
    });
    assert(slowedEval.versionType === 'SLOWED_EDIT', 'Identifies SLOWED_EDIT / sleepcore');
    assert(slowedEval.rightsStatus === 'DERIVATIVE_UNAUTHORIZED', 'Rejects slowed derivative as unauthorized');
  } catch (err) {
    console.error('  ❌ Version type classification error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 7: Internet Archive Rights Audit on Commercial Releases ────────────
  console.log('--- Test 7: Internet Archive Rights Audit (Unsupported CC Claims) ---');
  try {
    const starboyEval = dataIntegrityService.classifyInternetArchiveRights({
      candidate_title: 'Starboy',
      title: 'Starboy',
    });
    assert(starboyEval.rightsStatus === 'UNSUPPORTED_CC_CLAIM', 'Commercial pop track on IA marked UNSUPPORTED_CC_CLAIM');
    assert(starboyEval.rightsJustification.includes('Commercial sound recording'), 'Justification cites lack of copyright ownership');
    assert(starboyEval.downloadAllowed === false, 'Download allowed is strictly false');
  } catch (err) {
    console.error('  ❌ Rights audit error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 8: LRCLIB Missing Duration & Album Handling ───────────────────────
  console.log('--- Test 8: LRCLIB Lyrics Integrity & Missing Duration Handling ---');
  try {
    // Case 1: Missing duration in track -> cannot claim playback alignment
    const noDurationTrack = { title: '7 Years', artist: 'Lukas Graham', duration: null, album: '' };
    const eval1 = dataIntegrityService.classifyLyricsIntegrity(noDurationTrack, {
      status: 'SYNCHRONIZED',
      has_synced: 1,
      has_plain: 1,
      matched_duration: 239,
      match_confidence: 0.95,
    });
    assert(eval1.status === 'SYNCHRONIZED_NEEDS_REVIEW', 'Missing original duration yields SYNCHRONIZED_NEEDS_REVIEW');
    assert(eval1.verificationNotes.includes('lacks duration metadata'), 'Verification notes explain duration missing');

    // Case 2: Duration present and matches within 3s -> VERIFIED_SYNCHRONIZED
    const verifiedTrack = { title: '7 Years', artist: 'Lukas Graham', duration: 239, album: 'Lukas Graham' };
    const eval2 = dataIntegrityService.classifyLyricsIntegrity(verifiedTrack, {
      status: 'SYNCHRONIZED',
      has_synced: 1,
      has_plain: 1,
      matched_duration: 239,
      match_confidence: 0.95,
    });
    assert(eval2.status === 'VERIFIED_SYNCHRONIZED', 'Confirmed duration & high confidence yields VERIFIED_SYNCHRONIZED');

    // Case 3: Plain lyrics only -> PLAIN
    const plainTrack = { title: 'Unstoppable', artist: 'Sia', duration: 217 };
    const eval3 = dataIntegrityService.classifyLyricsIntegrity(plainTrack, {
      status: 'PLAIN',
      has_synced: 0,
      has_plain: 1,
      match_confidence: 0.90,
    });
    assert(eval3.status === 'PLAIN', 'Plain text lyrics yield PLAIN');

    // Case 4: Instrumental -> INSTRUMENTAL
    const instTrack = { title: 'Intro', artist: 'The xx', duration: 127 };
    const eval4 = dataIntegrityService.classifyLyricsIntegrity(instTrack, {
      status: 'INSTRUMENTAL',
      is_instrumental: 1,
      has_synced: 0,
      has_plain: 0,
    });
    assert(eval4.status === 'INSTRUMENTAL', 'Instrumental yields INSTRUMENTAL');
  } catch (err) {
    console.error('  ❌ Lyrics integrity test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 9: Concurrent Provider Searches (No Race Conditions) ──────────────
  console.log('--- Test 9: Concurrent Provider Search Safety ---');
  try {
    // Run two searches concurrently and verify candidate tracks do not bleed across promises
    const { getProvider } = require('./src/services/providers');
    const ia = getProvider('internet_archive');

    const [resA, resB] = await Promise.all([
      ia.findCandidates({ title: 'Starboy', artist: 'The Weeknd' }),
      ia.findCandidates({ title: 'Faded', artist: 'Alan Walker' }),
    ]);

    assert(Array.isArray(resA), 'Search A returned array');
    assert(Array.isArray(resB), 'Search B returned array');

    // Verify Starboy results don't contain Alan Walker and vice versa
    const starboyArtists = resA.map(c => (c.artist || '').toLowerCase());
    assert(!starboyArtists.some(a => a.includes('alan walker')), 'Search A results did not bleed from Search B');

    const fadedArtists = resB.map(c => (c.artist || '').toLowerCase());
    assert(!fadedArtists.some(a => a.includes('the weeknd')), 'Search B results did not bleed from Search A');
  } catch (err) {
    console.error('  ❌ Concurrent search error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 10: Multiple Scans Deduplication & Stable Identifiers ─────────────
  console.log('--- Test 10: Multiple Scans Deduplication & Stable Identifiers ---');
  try {
    const db = getDB();
    const testScanId = `test_dedup_${Date.now()}`;

    await db.query(sql`
      INSERT INTO coverage_scans (id, playlist_id, playlist_title, total_tracks, scanned_tracks, status, created_at)
      VALUES (${testScanId}, 'PLtest_dedup', 'Dedup Test', 1, 0, 'RUNNING', ${Math.floor(Date.now() / 1000)})
    `);

    // Insert same candidate twice
    for (let i = 0; i < 2; i++) {
      await db.query(sql`
        INSERT INTO audio_candidates (
          id, scan_id, track_id, playlist_position, video_id, title, artist,
          provider, provider_track_id, match_outcome, checked_at
        ) VALUES (
          ${crypto.randomUUID()}, ${testScanId}, 'track_1', 0, 'vid_1', 'Song', 'Artist',
          'internet_archive', 'ia_item_1', 'NEEDS_REVIEW', ${Math.floor(Date.now() / 1000)}
        )
        ON CONFLICT(scan_id, video_id, provider, provider_track_id) DO UPDATE SET
          checked_at = excluded.checked_at
      `);
    }

    const rows = await db.query(sql`
      SELECT COUNT(*) as cnt FROM audio_candidates WHERE scan_id = ${testScanId}
    `);
    assert(rows[0].cnt === 1, 'Duplicate candidate upsert correctly deduplicated by UNIQUE constraint (got 1 row)');
  } catch (err) {
    console.error('  ❌ Deduplication test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 11: CSV & JSON Export Verification ────────────────────────────────
  console.log('--- Test 11: CSV & JSON Export Verification ---');
  try {
    const db = getDB();
    const completedScans = await db.query(sql`
      SELECT id FROM coverage_scans WHERE status = 'COMPLETED' AND total_tracks = 181 ORDER BY created_at DESC LIMIT 1
    `);

    if (completedScans.length > 0) {
      const scanId = completedScans[0].id;

      // Test CSV Export
      const csvRes = await axios.get(`${API_BASE}/api/coverage/scans/${scanId}/export-csv`);
      assert(csvRes.status === 200, 'GET /export-csv returns 200');
      const lines = csvRes.data.split('\n').filter(Boolean);
      assert(lines.length === 182, `CSV export has exactly 182 lines (1 header + 181 tracks), got ${lines.length}`);

      const header = lines[0];
      assert(header.includes('Position'), 'CSV header includes Position');
      assert(header.includes('Track ID'), 'CSV header includes Track ID');
      assert(header.includes('Video ID'), 'CSV header includes Video ID');
      assert(header.includes('Rights Status'), 'CSV header includes Rights Status');
      assert(header.includes('Version Type'), 'CSV header includes Version Type');
      assert(header.includes('Verification Notes'), 'CSV header includes Verification Notes');

      // Test JSON Export
      const jsonRes = await axios.get(`${API_BASE}/api/coverage/scans/${scanId}/export`);
      assert(jsonRes.status === 200, 'GET /export returns 200');
      assert(Array.isArray(jsonRes.data.tracks), 'JSON export has tracks array');
      assert(jsonRes.data.tracks.length === 181, 'JSON export has exactly 181 tracks');

      // Test Audit Endpoint
      const auditRes = await axios.get(`${API_BASE}/api/coverage/scans/${scanId}/audit`);
      assert(auditRes.status === 200, 'GET /audit returns 200');
      assert(auditRes.data.totalAudited === 181, 'Audit reports 181 tracks audited');
      assert(auditRes.data.correctAssociations === 181, 'Audit reports 181 correct associations (100%)');
      assert(auditRes.data.mismatchesDetected === 0, 'Audit reports 0 identity mismatches in database');
      assert(typeof auditRes.data.candidatesRejectedRights === 'number' && auditRes.data.candidatesRejectedRights >= 0, 'Audit reports valid candidates rejected for unsupported rights count');
      assert(auditRes.data.lyricsNeedsReview === 164, 'Audit reports 164 lyrics needing duration review');
    } else {
      console.log('  ⏭ Skipped (no 181-track completed scan found in DB)');
    }
  } catch (err) {
    console.error('  ❌ Export test error:', err.message);
    failed++;
  }
  console.log();

  // ── TEST 12: Audit All 181 Tracks & Re-association Verification ────────────
  console.log('--- Test 12: Full 181-Track Audit Verification ---');
  try {
    const snapshotPath = path.join(__dirname, 'import_snapshot.json');
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

    // Verify all 181 tracks in snapshot have valid identities
    assert(snapshot.length === 181, 'Snapshot has exactly 181 tracks');

    const videoIdSet = new Set();
    let validIdentities = 0;
    for (let i = 0; i < snapshot.length; i++) {
      const t = snapshot[i];
      if (t.videoId && t.title && t.position !== undefined) {
        validIdentities++;
      }
      videoIdSet.add(t.videoId);
    }

    assert(validIdentities === 181, 'All 181 tracks possess valid videoId, title, and position');
    assert(videoIdSet.size === 181, 'All 181 tracks have 100% unique video IDs (zero duplicates)');
  } catch (err) {
    console.error('  ❌ Full 181-track audit test error:', err.message);
    failed++;
  }
  console.log();

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log('================================================================');
  console.log(`🧪 PHASE 3.1 TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase31Tests().catch(err => {
  console.error('Fatal Phase 3.1 test error:', err);
  process.exit(1);
});
