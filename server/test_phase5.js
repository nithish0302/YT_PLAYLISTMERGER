/**
 * Phase 5 Verification Test Suite:
 * Download Manager UI & Backend API Integration
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { getDB, sql, initDB } = require('./src/db');
const downloadService = require('./src/services/downloadService');
const downloadQueueManager = require('./src/services/downloadQueueManager');
const snapshotService = require('./src/services/snapshotService');
const dataIntegrityService = require('./src/services/dataIntegrityService');

let passedTests = 0;
let failedTests = 0;

function pass(msg) {
  passedTests++;
  console.log(`  ✅ PASS: ${msg}`);
}

function fail(msg, err) {
  failedTests++;
  console.error(`  ❌ FAIL: ${msg}`);
  if (err) console.error(err);
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 PHASE 5: DOWNLOAD MANAGER API & INTEGRATION VERIFICATION');
  console.log('================================================================\n');

  await initDB();

  // --- Test 1: Snapshot Loading & Verification (176 vs 181) ---
  console.log('--- Test 1: Snapshot Retrieval & Version Identification ---');
  try {
    const snapshots = await snapshotService.listSnapshots();
    assert(Array.isArray(snapshots), 'Snapshots list must be an array');
    assert(snapshots.length >= 2, `Expected at least 2 snapshots, got ${snapshots.length}`);
    pass(`Retrieved ${snapshots.length} registered playlist snapshots`);

    const snap176 = snapshots.find((s) => s.trackCount === 176 || s.snapshotId.includes('176'));
    const snap181 = snapshots.find((s) => s.trackCount === 181 || s.snapshotId.includes('181'));

    assert(snap176, 'Snapshot 176 tracks must exist');
    assert(snap181, 'Snapshot 181 tracks must exist');
    pass('Both 176-track (v1) and 181-track (v2) snapshots confirmed present');
  } catch (err) {
    fail('Snapshot verification failed', err);
  }

  // --- Test 2: Job Creation from Snapshot ---
  console.log('\n--- Test 2: Job Creation from Verified Snapshot ---');
  let testJobId = null;
  try {
    const job = await downloadService.createJobFromPlaylist({
      snapshotId: 'snapshot_PLMeZARHzcGt0_v2_181',
    });

    assert(job && job.id, 'Job should be created with an ID');
    assert.strictEqual(job.total_tracks, 181, 'Job should have exactly 181 tracks from snapshot');
    testJobId = job.id;
    pass(`Created download job ${testJobId} with 181 tracks from snapshot PLMeZARHzcGt0_v2_181`);
  } catch (err) {
    fail('Job creation from snapshot failed', err);
  }

  // --- Test 3: Dashboard Live Statistics Aggregation (9 Metrics) ---
  console.log('\n--- Test 3: Dashboard Live Statistics Aggregation (9 Metrics) ---');
  try {
    assert(testJobId, 'testJobId required');
    const stats = await downloadService.getDashboardStats(testJobId);

    assert(stats, 'Stats object must not be null');
    assert.strictEqual(typeof stats.totalTracks, 'number', 'totalTracks must be number');
    assert.strictEqual(stats.totalTracks, 181, 'totalTracks should equal 181');
    assert.strictEqual(typeof stats.authorizedAvailable, 'number', 'authorizedAvailable must be number');
    assert.strictEqual(typeof stats.downloadedSuccessfully, 'number', 'downloadedSuccessfully must be number');
    assert.strictEqual(typeof stats.downloading, 'number', 'downloading must be number');
    assert.strictEqual(typeof stats.waitingInQueue, 'number', 'waitingInQueue must be number');
    assert.strictEqual(typeof stats.lyricsAvailable, 'number', 'lyricsAvailable must be number');
    assert.strictEqual(typeof stats.lyricsRequiringReview, 'number', 'lyricsRequiringReview must be number');
    assert.strictEqual(typeof stats.unavailableTracks, 'number', 'unavailableTracks must be number');
    assert.strictEqual(typeof stats.failedDownloads, 'number', 'failedDownloads must be number');

    assert.strictEqual(stats.snapshotVersion, '181 tracks (v2)', 'Snapshot version must reflect 181 tracks (v2)');
    pass('Successfully computed all 9 dashboard overview metrics from database');
    pass(`Snapshot version identified: "${stats.snapshotVersion}"`);
    pass(`Completed: ${stats.completedCount}, Remaining: ${stats.remainingCount}`);
  } catch (err) {
    fail('Dashboard statistics aggregation failed', err);
  }

  // --- Test 4: Queue Control - Cancel Queue & Cleanup ---
  console.log('\n--- Test 4: Queue Control - Cancel Queue ---');
  try {
    assert(testJobId, 'testJobId required');
    await downloadQueueManager.cancelQueue(testJobId);

    const db = getDB();
    const rows = await db.query(sql`SELECT status FROM download_jobs WHERE id = ${testJobId}`);
    assert.strictEqual(rows[0].status, 'CANCELLED', 'Job status should be CANCELLED after cancelQueue');

    const trackRows = await db.query(sql`
      SELECT download_status FROM download_tracks WHERE job_id = ${testJobId} LIMIT 5
    `);
    const allCancelled = trackRows.every((t) => t.download_status === 'CANCELLED');
    assert(allCancelled, 'Active/ready tracks should be transitioned to CANCELLED');
    pass('cancelQueue successfully cancels job and marks tracks CANCELLED');
  } catch (err) {
    fail('Cancel queue failed', err);
  }

  // --- Test 5: Queue Control - Retry Track & Retry Failed ---
  console.log('\n--- Test 5: Queue Control - Retry Failed & Individual Retry ---');
  try {
    assert(testJobId, 'testJobId required');
    const db = getDB();

    // Mark 2 tracks as FAILED
    const tracks = await db.query(sql`SELECT id FROM download_tracks WHERE job_id = ${testJobId} LIMIT 2`);
    await db.query(sql`
      UPDATE download_tracks SET download_status = 'FAILED', error_message = 'Simulated timeout'
      WHERE id IN (${tracks[0].id}, ${tracks[1].id})
    `);

    // Verify retryTrack on individual track
    await downloadQueueManager.retryTrack(tracks[0].id);
    const retried1 = await db.query(sql`SELECT download_status, retry_count FROM download_tracks WHERE id = ${tracks[0].id}`);
    assert.strictEqual(retried1[0].download_status, 'READY', 'Individual retried track should be READY');
    assert(retried1[0].retry_count >= 1, 'retry_count should increment');
    pass('Individual retryTrack resets status to READY and increments retry_count');

    // Verify retryFailedTracks
    await downloadQueueManager.retryFailedTracks(testJobId);
    const retried2 = await db.query(sql`SELECT download_status FROM download_tracks WHERE id = ${tracks[1].id}`);
    assert.strictEqual(retried2[0].download_status, 'READY', 'Batch retried failed track should be READY');
    pass('retryFailedTracks resets all FAILED tracks back to READY and starts queue');
  } catch (err) {
    fail('Retry controls failed', err);
  }

  // --- Test 6: Rights Enforcement - Download Prohibited for Rejected Candidates ---
  console.log('\n--- Test 6: Rights Verification - Rejection of Unauthorized Pop Candidates ---');
  try {
    const rejectedVerdict = dataIntegrityService.classifyInternetArchiveRights({
      candidate_title: 'lovely',
      source_url: 'https://archive.org/details/lovely-billie-eilish',
      license_name: 'Creative Commons Attribution',
    });

    assert.strictEqual(Boolean(rejectedVerdict.downloadAllowed), false, 'Download must be strictly forbidden');
    assert.strictEqual(rejectedVerdict.rightsStatus, 'UNSUPPORTED_CC_CLAIM', 'Status must be UNSUPPORTED_CC_CLAIM');
    assert(rejectedVerdict.rightsJustification.includes('copyright ownership'), 'Reason must document copyright ownership issue');
    pass('Commercial pop recording on archive strictly rejected with UNSUPPORTED_CC_CLAIM');
    pass('Security barrier: rejected candidate downloadAllowed is FALSE');
  } catch (err) {
    fail('Rights enforcement test failed', err);
  }

  // --- Test 7: LRCLIB Lyrics Status Differentiation ---
  console.log('\n--- Test 7: Lyrics Status Separation (Verified vs Needs Review) ---');
  try {
    // Case 1: Duration missing in original track -> SYNCHRONIZED_NEEDS_REVIEW
    const evaluated1 = dataIntegrityService.classifyLyricsIntegrity(
      { title: 'lovely', artist: 'Billie Eilish', duration: null },
      { has_synced: 1, matched_duration: 200, match_confidence: 0.95 }
    );
    assert.strictEqual(evaluated1.status, 'SYNCHRONIZED_NEEDS_REVIEW', 'Missing duration must yield SYNCHRONIZED_NEEDS_REVIEW');
    assert.strictEqual(evaluated1.isVerified, false, 'Must not be verified without duration check');
    pass('Lyrics with unknown original duration marked SYNCHRONIZED_NEEDS_REVIEW (never falsely verified)');

    // Case 2: Duration matched & verified -> VERIFIED_SYNCHRONIZED
    const evaluated2 = dataIntegrityService.classifyLyricsIntegrity(
      { title: 'lovely', artist: 'Billie Eilish', duration: 200 },
      { has_synced: 1, matched_duration: 200.5, match_confidence: 0.95 }
    );
    assert.strictEqual(evaluated2.status, 'VERIFIED_SYNCHRONIZED', 'Matched duration yields VERIFIED_SYNCHRONIZED');
    assert.strictEqual(evaluated2.isVerified, true, 'Verified when evidence matches');
    pass('Lyrics with verified recording duration correctly promoted to VERIFIED_SYNCHRONIZED');
  } catch (err) {
    fail('Lyrics status separation failed', err);
  }

  console.log('\n================================================================');
  console.log(`🧪 PHASE 5 TEST RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
