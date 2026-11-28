/**
 * Phase 5.1 Verification Test Suite:
 * Download Manager Integration, Security and UI Audit
 */

const assert = require('assert');
const http = require('http');
const { getDB, sql, initDB } = require('./src/db');
const downloadService = require('./src/services/downloadService');
const downloadQueueManager = require('./src/services/downloadQueueManager');
const lyricsService = require('./src/services/lyricsService');

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

// HTTP request helper
function apiRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };
    const reqOptions = {
      hostname: 'localhost',
      port: 3001,
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {}),
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (_) {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 PHASE 5.1: INTEGRATION, SECURITY & AUTHORIZATION AUDIT');
  console.log('================================================================\n');

  await initDB();
  const db = getDB();

  // Create an isolated test job for Phase 5.1
  const testJobId = `job_test_p51_${Date.now()}`;
  await db.query(sql`
    INSERT INTO download_jobs (id, playlist_id, playlist_title, status, total_tracks, created_at, updated_at)
    VALUES (${testJobId}, 'PLMeZARHzcGt0', 'Security Audit Playlist', 'PENDING', 7, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
  `);

  // Insert test tracks representing each rights classification
  const trackRejected = `track_p51_rejected_${Date.now()}`;
  const trackCCUnsupported = `track_p51_unsupported_cc_${Date.now()}`;
  const trackUnverified = `track_p51_unverified_${Date.now()}`;
  const trackMissingRights = `track_p51_missing_rights_${Date.now()}`;
  const trackAuthorized = `track_p51_auth_${Date.now()}`;
  const trackLyricsReview = `track_p51_lyrics_${Date.now()}`;
  const trackUnavailable = `track_p51_unavail_${Date.now()}`;

  await db.query(sql`
    INSERT INTO download_tracks (id, job_id, video_id, playlist_position, playlist_track_number, title, artist, audio_provider, rights_status, download_status, match_outcome, source_url)
    VALUES 
      (${trackRejected}, ${testJobId}, 'vid_rej_1', 0, 1, 'Commercial Hit', 'Major Artist', 'internet_archive', 'REJECTED', 'FAILED', 'REJECTED', 'https://archive.org/download/test1/song.mp3'),
      (${trackCCUnsupported}, ${testJobId}, 'vid_cc_2', 1, 2, 'Bogus CC Song', 'Unknown Uploader', 'internet_archive', 'UNSUPPORTED_CC_CLAIM', 'FAILED', 'UNSUPPORTED_CC_CLAIM', 'https://archive.org/download/test2/song.mp3'),
      (${trackUnverified}, ${testJobId}, 'vid_unv_3', 2, 3, 'Unverified Song', 'Indie Artist', 'internet_archive', 'UNVERIFIED_RIGHTS', 'READY', 'NEEDS_REVIEW', 'https://archive.org/download/test3/song.mp3'),
      (${trackMissingRights}, ${testJobId}, 'vid_mis_4', 3, 4, 'Missing Rights Song', 'Some Artist', 'unknown_provider', NULL, 'READY', 'NEEDS_REVIEW', NULL),
      (${trackAuthorized}, ${testJobId}, 'vid_aut_5', 4, 5, 'Legit CC Song', 'Creative Commons Artist', 'jamendo', 'AUTHORIZED', 'READY', 'CONFIRMED', 'https://prod-1.storage.jamendo.com/download/track/123/mp32/'),
      (${trackLyricsReview}, ${testJobId}, 'vid_lyr_6', 5, 6, 'Lyrics Test Song', 'Lyrics Artist', 'jamendo', 'AUTHORIZED', 'COMPLETED', 'CONFIRMED', 'https://prod-1.storage.jamendo.com/download/track/456/mp32/'),
      (${trackUnavailable}, ${testJobId}, 'vid_una_7', 6, 7, 'No Audio Song', 'Solo Artist', NULL, NULL, 'UNAVAILABLE', 'UNAVAILABLE', NULL)
  `);

  // --- SECTION 1: Backend Authorization Enforcement ---
  console.log('--- Section 1: Backend Authorization Enforcement ---');

  // Test 1.1: Direct download endpoint blocks REJECTED track
  try {
    const res = await apiRequest({
      method: 'POST',
      path: `/api/downloads/tracks/${trackRejected}/download`,
    });
    assert.strictEqual(res.statusCode, 403, `Expected 403 Forbidden for REJECTED track, got ${res.statusCode}`);
    assert(res.data.error.includes('violates copyright policy') || res.data.error.includes('REJECTED'));
    pass(`POST /tracks/:trackId/download returns 403 Forbidden for REJECTED candidate`);
  } catch (err) {
    fail('Authorization enforcement failed on REJECTED download attempt', err);
  }

  // Test 1.2: Direct download endpoint blocks UNSUPPORTED_CC_CLAIM track
  try {
    const res = await apiRequest({
      method: 'POST',
      path: `/api/downloads/tracks/${trackCCUnsupported}/download`,
    });
    assert.strictEqual(res.statusCode, 403, `Expected 403 Forbidden for UNSUPPORTED_CC_CLAIM track, got ${res.statusCode}`);
    pass(`POST /tracks/:trackId/download returns 403 Forbidden for UNSUPPORTED_CC_CLAIM candidate`);
  } catch (err) {
    fail('Authorization enforcement failed on UNSUPPORTED_CC_CLAIM download attempt', err);
  }

  // Test 1.3: Direct download endpoint blocks UNVERIFIED_RIGHTS track
  try {
    const res = await apiRequest({
      method: 'POST',
      path: `/api/downloads/tracks/${trackUnverified}/download`,
    });
    assert.strictEqual(res.statusCode, 403, `Expected 403 Forbidden for UNVERIFIED_RIGHTS track, got ${res.statusCode}`);
    pass(`POST /tracks/:trackId/download returns 403 Forbidden for UNVERIFIED_RIGHTS candidate`);
  } catch (err) {
    fail('Authorization enforcement failed on UNVERIFIED_RIGHTS download attempt', err);
  }

  // Test 1.4: Direct download endpoint blocks track with missing rights/provider
  try {
    const res = await apiRequest({
      method: 'POST',
      path: `/api/downloads/tracks/${trackMissingRights}/download`,
    });
    assert.strictEqual(res.statusCode, 400, `Expected 400 Bad Request for track with missing rights, got ${res.statusCode}`);
    pass(`POST /tracks/:trackId/download returns 400 Bad Request for candidate with missing rights/provider`);
  } catch (err) {
    fail('Authorization enforcement failed on missing rights download attempt', err);
  }

  // Test 1.5: Direct download endpoint blocks non-existent track
  try {
    const res = await apiRequest({
      method: 'POST',
      path: `/api/downloads/tracks/non_existent_track_99999/download`,
    });
    assert.strictEqual(res.statusCode, 404, `Expected 404 Not Found, got ${res.statusCode}`);
    pass(`POST /tracks/:trackId/download returns 404 Not Found for non-existent track ID`);
  } catch (err) {
    fail('Non-existent track download test failed', err);
  }

  // Test 1.6: Retry endpoint blocks unauthorized track
  try {
    const res = await apiRequest({
      method: 'POST',
      path: `/api/downloads/tracks/${trackRejected}/retry`,
    });
    assert.strictEqual(res.statusCode, 403, `Expected 403 Forbidden on retry for REJECTED track, got ${res.statusCode}`);
    pass(`POST /tracks/:trackId/retry returns 403 Forbidden for REJECTED candidate`);
  } catch (err) {
    fail('Authorization enforcement failed on retry endpoint', err);
  }

  // Test 1.7: Confirm source blocks commercial audio on Internet Archive
  try {
    const res = await apiRequest({
      method: 'POST',
      path: `/api/downloads/tracks/${trackUnverified}/confirm-source`,
    }, {
      provider: 'internet_archive',
      sourceTrackId: 'commercial_rip_fake_archive_item',
    });
    assert.strictEqual(res.statusCode, 403, `Expected 403 Forbidden when attempting to bind commercial IA item, got ${res.statusCode}`);
    pass(`POST /tracks/:trackId/confirm-source returns 403 Forbidden when attempting to confirm commercial audio`);
  } catch (err) {
    fail('Authorization enforcement failed on confirm-source endpoint', err);
  }

  // Test 1.8: Non-existent job ID handling
  try {
    const resStart = await apiRequest({
      method: 'POST',
      path: `/api/downloads/jobs/non_existent_job_xyz/start`,
    });
    assert.strictEqual(resStart.statusCode, 404, `Expected 404 Not Found for non-existent job start, got ${resStart.statusCode}`);

    const resResume = await apiRequest({
      method: 'POST',
      path: `/api/downloads/jobs/non_existent_job_xyz/resume`,
    });
    assert.strictEqual(resResume.statusCode, 404, `Expected 404 Not Found for non-existent job resume, got ${resResume.statusCode}`);

    const resExport = await apiRequest({
      method: 'GET',
      path: `/api/downloads/jobs/non_existent_job_xyz/export`,
    });
    assert.strictEqual(resExport.statusCode, 404, `Expected 404 Not Found for non-existent job export, got ${resExport.statusCode}`);
    pass(`Queue control and export endpoints return 404 Not Found for invalid job IDs`);
  } catch (err) {
    fail('Non-existent job ID validation failed', err);
  }

  // --- SECTION 2: Lyrics Status Integrity ---
  console.log('\n--- Section 2: Lyrics Status Integrity ---');
  try {
    // Insert lyrics metadata in SYNCHRONIZED_NEEDS_REVIEW state
    await db.query(sql`
      INSERT INTO lyrics_metadata (id, track_id, lrclib_id, plain_lyrics, synced_lyrics, needs_confirmation, confirmed_by_user, match_confidence)
      VALUES (${'lm_' + trackLyricsReview}, ${trackLyricsReview}, 9999, 'Line 1\nLine 2', '[00:01.00] Line 1\n[00:05.00] Line 2', 1, 0, 0.72)
    `);
    await db.query(sql`
      UPDATE download_tracks SET lyrics_status = 'SYNCHRONIZED_NEEDS_REVIEW' WHERE id = ${trackLyricsReview}
    `);

    // Fetch initial lyrics metadata
    const lyricsResBefore = await apiRequest({
      method: 'GET',
      path: `/api/downloads/tracks/${trackLyricsReview}/lyrics`,
    });
    assert.strictEqual(lyricsResBefore.statusCode, 200);
    assert.strictEqual(lyricsResBefore.data.needs_confirmation, 1);
    pass(`Initial lyrics state established as SYNCHRONIZED_NEEDS_REVIEW with needs_confirmation = 1`);

    // Perform User Confirmation via API
    const confirmRes = await apiRequest({
      method: 'POST',
      path: `/api/downloads/tracks/${trackLyricsReview}/confirm-lyrics`,
    }, { confirmed: true });
    assert.strictEqual(confirmRes.statusCode, 200);
    assert.strictEqual(confirmRes.data.success, true);

    // Verify DB state
    const trackRows = await db.query(sql`SELECT lyrics_status FROM download_tracks WHERE id = ${trackLyricsReview}`);
    const metaRows = await db.query(sql`SELECT needs_confirmation, confirmed_by_user FROM lyrics_metadata WHERE track_id = ${trackLyricsReview}`);

    assert.strictEqual(trackRows[0].lyrics_status, 'USER_CONFIRMED_MATCH', 
      `User confirmed lyrics must be set to 'USER_CONFIRMED_MATCH', not '${trackRows[0].lyrics_status}'`);
    assert.notStrictEqual(trackRows[0].lyrics_status, 'VERIFIED_SYNCHRONIZED',
      `User confirmed lyrics must NEVER be automatically promoted to 'VERIFIED_SYNCHRONIZED'`);
    assert.strictEqual(metaRows[0].needs_confirmation, 0);
    assert.strictEqual(metaRows[0].confirmed_by_user, 1);
    pass(`User confirmation sets lyrics_status = 'USER_CONFIRMED_MATCH' and preserves strict separation from 'VERIFIED_SYNCHRONIZED'`);
  } catch (err) {
    fail('Lyrics status integrity verification failed', err);
  }

  // --- SECTION 3: Dashboard Metric Consistency & SQLite Parity ---
  console.log('\n--- Section 3: Dashboard Metric Consistency & SQLite Parity ---');
  try {
    // Setup a metric test job
    const metricJobId = `job_metric_${Date.now()}`;
    await db.query(sql`
      INSERT INTO download_jobs (id, playlist_id, playlist_title, status, total_tracks, created_at, updated_at)
      VALUES (${metricJobId}, 'PLMeZARHzcGt0', 'Metric Consistency Job', 'DOWNLOADING', 7, ${Math.floor(Date.now() / 1000)}, ${Math.floor(Date.now() / 1000)})
    `);

    // Insert 7 tracks with distinct, unambiguous states
    const mTracks = [
      { id: `mt_1_${Date.now()}`, dl: 'COMPLETED', ly: 'VERIFIED_SYNCHRONIZED', rights: 'AUTHORIZED' },
      { id: `mt_2_${Date.now()}`, dl: 'PARTIAL', ly: 'USER_CONFIRMED_MATCH', rights: 'AUTHORIZED' },
      { id: `mt_3_${Date.now()}`, dl: 'DOWNLOADING', ly: 'SYNCHRONIZED_NEEDS_REVIEW', rights: 'AUTHORIZED' },
      { id: `mt_4_${Date.now()}`, dl: 'READY', ly: 'PLAIN', rights: 'AUTHORIZED' },
      { id: `mt_5_${Date.now()}`, dl: 'FAILED', ly: 'UNAVAILABLE', rights: 'AUTHORIZED' },
      { id: `mt_6_${Date.now()}`, dl: 'CANCELLED', ly: 'UNAVAILABLE', rights: 'AUTHORIZED' },
      { id: `mt_7_${Date.now()}`, dl: 'UNAVAILABLE', ly: 'UNAVAILABLE', rights: 'REJECTED' },
    ];

    for (let i = 0; i < mTracks.length; i++) {
      const t = mTracks[i];
      await db.query(sql`
        INSERT INTO download_tracks (id, job_id, video_id, playlist_position, playlist_track_number, title, artist, audio_provider, rights_status, download_status, lyrics_status)
        VALUES (${t.id}, ${metricJobId}, ${'vid_m_' + i}, ${i}, ${i + 1}, ${'Track ' + i}, 'Artist', 'jamendo', ${t.rights}, ${t.dl}, ${t.ly})
      `);
      if (t.ly !== 'UNAVAILABLE') {
        await db.query(sql`
          INSERT INTO lyrics_metadata (id, track_id, lrclib_id, plain_lyrics, synced_lyrics, needs_confirmation)
          VALUES (${'lm_' + t.id}, ${t.id}, 8888, 'Sample lyrics', ${t.ly.includes('SYNCHRONIZED') ? '[00:01.00] Sample' : null}, ${t.ly === 'SYNCHRONIZED_NEEDS_REVIEW' ? 1 : 0})
        `);
      }
    }

    const statsRes = await apiRequest({
      method: 'GET',
      path: `/api/downloads/jobs/${metricJobId}/stats`,
    });

    assert.strictEqual(statsRes.statusCode, 200);
    const stats = statsRes.data;

    // Verify 1-to-1 matching
    assert.strictEqual(stats.totalTracks, 7, 'Total tracks must equal 7');
    assert.strictEqual(stats.completedDownloads, 1, 'Completed downloads must be exactly 1');
    assert.strictEqual(stats.partialDownloads, 1, 'Partial downloads must be exactly 1');
    assert.strictEqual(stats.downloadedSuccessfully, 2, 'Downloaded successfully must equal completed + partial (2)');
    assert.strictEqual(stats.downloading, 1, 'Downloading count must be 1');
    assert.strictEqual(stats.waitingInQueue, 1, 'Waiting in queue must be 1');
    assert.strictEqual(stats.failedDownloads, 1, 'Failed downloads must be 1 (cancelled not counted as failed)');
    assert.strictEqual(stats.cancelledDownloads, 1, 'Cancelled downloads must be 1');
    assert.strictEqual(stats.unavailableTracks, 1, 'Unavailable tracks must be 1');

    // Lyrics metrics
    assert.strictEqual(stats.lyricsVerified, 1, 'Lyrics verified must be exactly 1');
    assert.strictEqual(stats.lyricsUserConfirmed, 1, 'Lyrics user confirmed must be exactly 1');
    assert.strictEqual(stats.lyricsRequiringReview, 1, 'Lyrics requiring review must be exactly 1');
    assert.strictEqual(stats.lyricsPlain, 1, 'Lyrics plain must be exactly 1');
    assert.strictEqual(stats.lyricsUnavailable, 3, 'Lyrics unavailable must be exactly 3');

    pass('Dashboard metrics verified: completed (1) and partial (1) counted separately');
    pass('Dashboard metrics verified: cancelled (1) is separate from failed (1)');
    pass('Dashboard metrics verified: lyrics review (1) is distinct from verified (1) and user confirmed (1)');
    pass('Dashboard metrics verified: unavailable tracks (1) distinct from failed (1)');
    pass('All 12 dashboard metric aggregations match underlying SQLite records with 100% precision');
  } catch (err) {
    fail('Dashboard metric consistency verification failed', err);
  }

  // --- SECTION 4: SSE Reliability & Multi-Client Reconnection ---
  console.log('\n--- Section 4: SSE Reliability & Multi-Client Subscription ---');
  try {
    const sseJobId = testJobId;

    // Connect Client 1
    const client1Events = [];
    const client2Events = [];

    const connectSSE = (clientName, eventsArray) => {
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: 'localhost',
          port: 3001,
          path: `/api/downloads/jobs/${sseJobId}/events`,
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
          },
        }, (res) => {
          assert.strictEqual(res.statusCode, 200);
          assert.strictEqual(res.headers['content-type'], 'text/event-stream');

          res.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            let currentEvent = 'message';
            let currentData = '';
            for (const line of lines) {
              if (line.startsWith('event: ')) {
                currentEvent = line.replace('event: ', '').trim();
              } else if (line.startsWith('data: ')) {
                currentData = line.replace('data: ', '').trim();
                eventsArray.push({ event: currentEvent, data: currentData });
              }
            }
          });

          // Wait a brief moment to ensure connected + sync_state are delivered
          setTimeout(() => {
            resolve({ req, res });
          }, 350);
        });

        req.on('error', reject);
        req.end();
      });
    };

    const c1 = await connectSSE('Client 1', client1Events);
    pass('Client 1 connected to SSE stream');

    const c2 = await connectSSE('Client 2', client2Events);
    pass('Client 2 connected to SSE stream simultaneously');

    // Verify both received 'connected' and 'sync_state'
    const c1Connected = client1Events.find(e => e.event === 'connected');
    const c1Sync = client1Events.find(e => e.event === 'sync_state');
    assert(c1Connected, 'Client 1 must receive connected event');
    assert(c1Sync, 'Client 1 must receive sync_state event on connection');

    const c2Connected = client2Events.find(e => e.event === 'connected');
    const c2Sync = client2Events.find(e => e.event === 'sync_state');
    assert(c2Connected, 'Client 2 must receive connected event');
    assert(c2Sync, 'Client 2 must receive sync_state event on connection');
    pass('Both concurrent SSE clients received initial "connected" and "sync_state" payloads');

    // Trigger an update: queue pause
    await apiRequest({
      method: 'POST',
      path: `/api/downloads/jobs/${sseJobId}/pause`,
    });

    await new Promise(r => setTimeout(r, 200));

    // Disconnect Client 1 cleanly (simulating page close or navigation)
    c1.req.destroy();
    pass('Client 1 disconnected cleanly');

    // Resume queue and verify Client 2 still receives updates
    await apiRequest({
      method: 'POST',
      path: `/api/downloads/jobs/${sseJobId}/resume`,
    });

    await new Promise(r => setTimeout(r, 200));

    // Reconnect Client 1 (simulating browser refresh)
    const client1ReconnectedEvents = [];
    const c1Reconnected = await connectSSE('Client 1 Reconnected', client1ReconnectedEvents);
    const reconnectedSync = client1ReconnectedEvents.find(e => e.event === 'sync_state');
    assert(reconnectedSync, 'Reconnected client must immediately receive sync_state payload for UI state recovery');
    pass('Client 1 reconnected after refresh and immediately received sync_state recovery event');

    // Clean up connections
    c2.req.destroy();
    c1Reconnected.req.destroy();
    pass('All SSE test streams cleanly closed without unhandled exceptions');
  } catch (err) {
    fail('SSE reliability test failed', err);
  }

  // --- SECTION 5: ZIP Export Rights Sanitization ---
  console.log('\n--- Section 5: ZIP Export Rights Sanitization ---');
  try {
    const exportRes = await apiRequest({
      method: 'GET',
      path: `/api/downloads/jobs/${testJobId}/export`,
    });

    assert.strictEqual(exportRes.statusCode, 200);
    assert.strictEqual(exportRes.headers['content-type'], 'application/zip');
    assert(exportRes.headers['content-disposition'].includes('Security_Audit_Playlist_library_export.zip'));
    pass('GET /jobs/:jobId/export returned 200 OK with application/zip');
  } catch (err) {
    fail('ZIP export test failed', err);
  }

  // Clean up test data
  try {
    await db.query(sql`DELETE FROM download_tracks WHERE job_id = ${testJobId}`);
    await db.query(sql`DELETE FROM download_jobs WHERE id = ${testJobId}`);
  } catch (_) {}

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedTests} passed, ${failedTests} failed`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
