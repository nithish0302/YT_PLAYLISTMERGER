const { getDB, sql } = require('./src/db');
const fs = require('fs');
const path = require('path');

async function main() {
  const db = getDB();
  const snapshotPath = path.join(__dirname, 'import_snapshot.json');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));

  // Get the scan
  const scans = await db.query(sql`SELECT * FROM coverage_scans ORDER BY created_at DESC LIMIT 5`);
  console.log('Recent scans:', scans.map(s => ({ id: s.id, status: s.status, tracks: s.scanned_tracks, title: s.playlist_title })));

  const scanId = scans[0]?.id;
  if (!scanId) {
    console.log('No scans found');
    return;
  }

  // Check what tracks were sent in or saved in audio_candidates
  const audioRows = await db.query(sql`SELECT * FROM audio_candidates WHERE scan_id = ${scanId}`);
  console.log('Audio rows count in scan:', audioRows.length);

  const lyricsRows = await db.query(sql`SELECT * FROM lyrics_candidates WHERE scan_id = ${scanId}`);
  console.log('Lyrics rows count in scan:', lyricsRows.length);

  // Check V1Pl8CzNzCw
  const vAudio = audioRows.filter(r => r.video_id === 'V1Pl8CzNzCw');
  console.log('Audio for V1Pl8CzNzCw:', vAudio);

  const vLyrics = lyricsRows.filter(r => r.video_id === 'V1Pl8CzNzCw');
  console.log('Lyrics for V1Pl8CzNzCw:', vLyrics);

  // Check Starboy and Cradles
  const starboyAudio = audioRows.filter(r => (r.title && r.title.toLowerCase().includes('starboy')) || (r.candidate_title && r.candidate_title.toLowerCase().includes('starboy')));
  console.log('Starboy audio rows:', starboyAudio.map(r => ({ video_id: r.video_id, title: r.title, artist: r.artist, candidate_title: r.candidate_title })));

  const cradlesAudio = audioRows.filter(r => (r.title && r.title.toLowerCase().includes('cradles')) || (r.candidate_title && r.candidate_title.toLowerCase().includes('cradles')));
  console.log('Cradles audio rows:', cradlesAudio.map(r => ({ video_id: r.video_id, title: r.title, artist: r.artist, candidate_title: r.candidate_title })));

  // Compare snapshot with lyricsRows and audioRows
  let mismatches = 0;
  for (const lr of lyricsRows) {
    const snap = snapshot.find(s => s.videoId === lr.video_id);
    if (!snap) {
      console.log(`Video ID ${lr.video_id} NOT found in snapshot! title in row: "${lr.title}"`);
      mismatches++;
    } else {
      // Check if title or artist matches
      if (snap.title !== lr.title) {
        console.log(`Title mismatch for ${lr.video_id}: snapshot has "${snap.title}" but lyrics_candidates has "${lr.title}"`);
        mismatches++;
      }
    }
  }
  console.log(`Total title/videoId mismatches between lyrics_candidates and snapshot: ${mismatches}`);
}

main().catch(console.error);
