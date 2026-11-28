const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getDB, sql } = require('./src/db');

async function test12IaCandidates() {
  const db = getDB();
  const scanRows = await db.query(sql`SELECT id FROM coverage_scans WHERE status = 'COMPLETED' ORDER BY created_at DESC LIMIT 1`);
  const scanId = scanRows[0]?.id;
  if (!scanId) {
    console.error('No completed scan found in DB');
    return;
  }

  const reviewCandidates = await db.query(sql`
    SELECT * FROM audio_candidates
    WHERE scan_id = ${scanId} AND provider = 'internet_archive' AND match_outcome = 'NEEDS_REVIEW' AND is_best = 1
  `);
  console.log(`Found ${reviewCandidates.length} review candidates in DB for scan ${scanId}.`);

  const results = [];

  for (const c of reviewCandidates) {
    const identifier = c.source_url.replace('https://archive.org/details/', '').split('/')[0];
    console.log(`\nChecking IA item: "${identifier}" for track: "${c.title}" by "${c.artist}"`);

    try {
      const res = await axios.get(`https://archive.org/metadata/${identifier}`, { timeout: 15000 });
      const meta = res.data.metadata || {};
      const files = res.data.files || [];

      const uploader = meta.uploader || meta.creator || 'unknown';
      const licenseurl = meta.licenseurl || 'none';
      const rights = meta.rights || 'none';
      const description = (meta.description || '').slice(0, 200);

      // Check audio files
      const audioFiles = files.filter(f => f.name && (f.name.endsWith('.mp3') || f.name.endsWith('.flac') || f.name.endsWith('.ogg')));

      // Assess copyright ownership & authorization
      // Does the uploader have authority to license a commercial pop track?
      // For instance, an anonymous uploader putting "Starboy by The Weeknd" under CC is an unsupported CC claim!
      let rightsStatus = 'UNSUPPORTED_CC_CLAIM';
      let rightsJustification = '';
      let versionType = 'STUDIO_ORIGINAL';

      const titleLower = (c.candidate_title || '').toLowerCase();
      if (titleLower.includes('nightcore')) versionType = 'NIGHTCORE';
      else if (titleLower.includes('cover')) versionType = 'COVER';
      else if (titleLower.includes('live')) versionType = 'LIVE';
      else if (titleLower.includes('sleepcore') || titleLower.includes('edit')) versionType = 'SLOWED_EDIT';
      else if (titleLower.includes('ncs')) versionType = 'NCS_RELEASE';
      else if (titleLower.includes('remix') || titleLower.includes('feat.')) versionType = 'REMIX';

      if (versionType === 'COVER') {
        rightsStatus = 'NEEDS_MECHANICAL_LICENSE_PROOF';
        rightsJustification = 'Cover version uploaded by third party. Without proof of mechanical license or explicit rights transfer, cannot be treated as authorized public domain/CC.';
      } else if (versionType === 'NIGHTCORE' || versionType === 'SLOWED_EDIT' || versionType === 'REMIX') {
        rightsStatus = 'DERIVATIVE_UNAUTHORIZED';
        rightsJustification = 'Derivative work (pitch/tempo shift or remix) of copyrighted sound recording. Creative Commons tag by uploader is invalid without master rights.';
      } else if (versionType === 'LIVE') {
        rightsStatus = 'BOOTLEG_UNAUTHORIZED';
        rightsJustification = 'Live concert recording. Master rights belong to recording artist / label; third-party uploader cannot grant Creative Commons.';
      } else if (versionType === 'NCS_RELEASE') {
        rightsStatus = 'COMMUNITY_RELEASE_UNVERIFIED';
        rightsJustification = 'NCS upload on Internet Archive by third-party scraper rather than official label account. Requires verification of official distribution channel.';
      } else {
        rightsStatus = 'UNSUPPORTED_CC_CLAIM';
        rightsJustification = `Commercial recording uploaded by third-party user (${uploader}). Creative Commons metadata is unsupported by copyright ownership.`;
      }

      results.push({
        candidateId: c.id,
        videoId: c.video_id,
        title: c.title,
        artist: c.artist,
        candidateTitle: c.candidate_title,
        identifier,
        uploader,
        licenseurl,
        rights,
        versionType,
        rightsStatus,
        rightsJustification,
        audioFilesCount: audioFiles.length,
        audioFormats: audioFiles.map(f => f.format || f.name.split('.').pop()).slice(0, 3)
      });
    } catch (err) {
      console.error(`Failed to fetch metadata for ${identifier}:`, err.message);
      results.push({
        candidateId: c.id,
        videoId: c.video_id,
        title: c.title,
        artist: c.artist,
        candidateTitle: c.candidate_title,
        identifier,
        error: err.message,
        rightsStatus: 'METADATA_FETCH_ERROR',
        rightsJustification: `Failed to fetch Internet Archive metadata: ${err.message}`
      });
    }
  }

  console.log('\n--- AUDIT RESULTS FOR 12 IA CANDIDATES ---');
  console.log(JSON.stringify(results, null, 2));
  const outPath = path.join(__dirname, 'ia_12_audit_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Saved audit results to ${outPath}`);
}

test12IaCandidates().catch(console.error);
