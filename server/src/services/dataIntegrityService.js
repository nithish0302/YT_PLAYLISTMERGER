const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDB, sql } = require('../db');
const lyricsConfig = require('../config/lyricsConfig');

class DataIntegrityService {
  /**
   * Evaluates Internet Archive rights and uploader credibility.
   * Rejects unsupported third-party Creative Commons assertions on commercial works.
   */
  classifyInternetArchiveRights(candidate) {
    const titleLower = (candidate.candidate_title || candidate.title || '').toLowerCase();
    const sourceUrl = candidate.source_url || '';
    const licenseName = candidate.license_name || '';

    let versionType = 'STUDIO_ORIGINAL';
    if (titleLower.includes('nightcore')) versionType = 'NIGHTCORE';
    else if (titleLower.includes('cover')) versionType = 'COVER';
    else if (titleLower.includes('live')) versionType = 'LIVE';
    else if (titleLower.includes('sleepcore') || titleLower.includes('edit')) versionType = 'SLOWED_EDIT';
    else if (titleLower.includes('ncs release') || titleLower.includes('ncs')) versionType = 'NCS_RELEASE';
    else if (titleLower.includes('remix') || titleLower.includes('feat.') || titleLower.includes('remix')) versionType = 'REMIX';

    let rightsStatus = 'UNSUPPORTED_CC_CLAIM';
    let rightsJustification = '';
    let isDownloadAllowed = false;

    if (versionType === 'COVER') {
      rightsStatus = 'NEEDS_MECHANICAL_LICENSE_PROOF';
      rightsJustification = 'Cover recording uploaded by third party. Without documentation of a mechanical license or rights assignment from copyright owner, cannot be verified as authorized.';
    } else if (versionType === 'NIGHTCORE' || versionType === 'SLOWED_EDIT' || versionType === 'REMIX') {
      rightsStatus = 'DERIVATIVE_UNAUTHORIZED';
      rightsJustification = 'Derivative work (pitch/tempo shift, slowed edit, or unauthorized remix) created from copyrighted sound recording. Creative Commons claim by uploader is legally invalid.';
    } else if (versionType === 'LIVE') {
      rightsStatus = 'BOOTLEG_UNAUTHORIZED';
      rightsJustification = 'Live concert audio recording. Exclusive master recording rights belong to the artist/label; third-party uploader lacks authority to place under Creative Commons.';
    } else if (versionType === 'NCS_RELEASE') {
      rightsStatus = 'COMMUNITY_RELEASE_UNVERIFIED';
      rightsJustification = 'Third-party community scraper upload of NoCopyrightSounds track. Official rights clearance requires downloading through verified official label channels.';
    } else {
      rightsStatus = 'UNSUPPORTED_CC_CLAIM';
      rightsJustification = 'Commercial sound recording uploaded to Internet Archive by third-party user. Uploader Creative Commons or Public Domain claim is not supported by copyright ownership.';
    }

    return {
      versionType,
      rightsStatus,
      rightsJustification,
      downloadAllowed: isDownloadAllowed, // Always false for unsupported/unauthorized claims
    };
  }

  /**
   * Audits LRCLIB lyrics record against playlist track.
   * Checks timestamps, missing duration/album handling, and confidence.
   */
  classifyLyricsIntegrity(track, lyricsRow) {
    if (!lyricsRow || lyricsRow.status === 'UNAVAILABLE') {
      return {
        status: 'UNAVAILABLE',
        timestampsPresent: false,
        verificationNotes: 'No lyrics found on LRCLIB for this title and artist.',
        isVerified: false,
      };
    }

    if (lyricsRow.status === 'ERROR') {
      return {
        status: 'ERROR',
        timestampsPresent: false,
        verificationNotes: lyricsRow.error_message || 'Lookup encountered an error.',
        isVerified: false,
      };
    }

    if (lyricsRow.is_instrumental) {
      return {
        status: 'INSTRUMENTAL',
        timestampsPresent: false,
        verificationNotes: 'Track confirmed as instrumental in LRCLIB database.',
        isVerified: true,
      };
    }

    // Check if synced lyrics exist
    const hasSynced = Boolean(lyricsRow.has_synced);
    const hasPlain = Boolean(lyricsRow.has_plain);

    if (!hasSynced && hasPlain) {
      return {
        status: 'PLAIN',
        timestampsPresent: false,
        verificationNotes: 'Plain lyrics available, but no timestamps present for synchronized display.',
        isVerified: true,
      };
    }

    if (hasSynced) {
      // Check if duration and album were provided in the original playlist snapshot
      const originalDuration = track.duration;
      const originalAlbum = track.album;
      const matchedDuration = lyricsRow.matched_duration;

      // When original duration is missing from the playlist JSON, we cannot verify
      // against the exact YouTube playback recording length.
      if (!originalDuration) {
        return {
          status: 'SYNCHRONIZED_NEEDS_REVIEW',
          timestampsPresent: true,
          verificationNotes: 'Synchronized timestamps exist, but original playlist JSON lacks duration metadata. Cannot verify sync alignment against exact YouTube playback recording without duration check.',
          isVerified: false,
        };
      }

      // Explicit duration thresholds centralized via lyricsConfig
      if (matchedDuration) {
        const diff = Math.abs(originalDuration - matchedDuration);
        if (diff > lyricsConfig.DURATION_VARIANCE_ZONE_SEC) {
          return {
            status: lyricsConfig.STATUS.SYNCHRONIZED_NEEDS_REVIEW,
            timestampsPresent: true,
            verificationNotes: `Synchronized lyrics duration (${matchedDuration}s) differs from track duration (${originalDuration}s) by ${diff.toFixed(1)}s (>${lyricsConfig.DURATION_VARIANCE_ZONE_SEC}s). Manual verification required.`,
            isVerified: false,
          };
        } else if (diff > lyricsConfig.DURATION_VERIFIED_TOLERANCE_SEC) {
          return {
            status: lyricsConfig.STATUS.SYNCHRONIZED_NEEDS_REVIEW,
            timestampsPresent: true,
            verificationNotes: `Synchronized lyrics duration (${matchedDuration}s) differs from track duration (${originalDuration}s) by ${diff.toFixed(1)}s (within 2-4s ambiguous variance zone). Manual verification required.`,
            isVerified: false,
          };
        }
      }

      // Strong title/artist match + duration match within tolerance
      if (lyricsRow.match_confidence >= lyricsConfig.MIN_CONFIDENCE_VERIFIED) {
        const deltaStr = matchedDuration ? ` (duration delta ${Math.abs(originalDuration - matchedDuration).toFixed(1)}s <= ${lyricsConfig.DURATION_VERIFIED_TOLERANCE_SEC}s)` : '';
        return {
          status: lyricsConfig.STATUS.VERIFIED_SYNCHRONIZED,
          timestampsPresent: true,
          verificationNotes: `High confidence match (${Math.round(lyricsRow.match_confidence * 100)}%) with synchronized timestamp tags verified against track recording${deltaStr}.`,
          isVerified: true,
        };
      } else {
        return {
          status: lyricsConfig.STATUS.SYNCHRONIZED_NEEDS_REVIEW,
          timestampsPresent: true,
          verificationNotes: `Moderate confidence (${Math.round(lyricsRow.match_confidence * 100)}% < ${Math.round(lyricsConfig.MIN_CONFIDENCE_VERIFIED * 100)}%). Title/artist match requires verification before playback sync.`,
          isVerified: false,
        };
      }
    }

    return {
      status: 'UNAVAILABLE',
      timestampsPresent: false,
      verificationNotes: 'No lyrics available.',
      isVerified: false,
    };
  }

  /**
   * Run a complete data integrity audit on a scan.
   * Compares database records against official snapshot and applies strict rights/identity checks.
   */
  async runAudit(scanId, officialTracks = null) {
    const db = getDB();

    // 1. Get official tracks (from snapshot file or passed in)
    let tracks = officialTracks;
    if (!tracks) {
      const snapshotPath = path.join(__dirname, '..', '..', 'import_snapshot.json');
      if (fs.existsSync(snapshotPath)) {
        try {
          const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
          tracks = Array.isArray(raw) ? raw : (raw.tracks || []);
        } catch (_) {}
      }
    }

    if (!tracks || tracks.length === 0) {
      // Fallback to tracks stored in download_tracks
      const dtRows = await db.query(sql`SELECT * FROM download_tracks ORDER BY playlist_position ASC`);
      if (dtRows.length > 0) {
        tracks = dtRows.map(r => ({
          trackId: r.id,
          videoId: r.video_id,
          title: r.title,
          artist: r.artist,
          album: r.album,
          duration: r.duration,
          position: r.playlist_position,
        }));
      }
    }

    if (!tracks || tracks.length === 0) {
      throw new Error('No playlist snapshot available to audit against.');
    }

    console.log(`[DataIntegrity] Auditing scan ${scanId} against ${tracks.length} official tracks...`);

    // 2. Fetch existing candidates and lyrics for this scan
    const audioCandidates = await db.query(sql`
      SELECT * FROM audio_candidates WHERE scan_id = ${scanId}
    `);
    const lyricsCandidates = await db.query(sql`
      SELECT * FROM lyrics_candidates WHERE scan_id = ${scanId}
    `);

    // Index by video_id
    const audioByVideoId = new Map();
    for (const ac of audioCandidates) {
      if (!audioByVideoId.has(ac.video_id)) audioByVideoId.set(ac.video_id, []);
      audioByVideoId.get(ac.video_id).push(ac);
    }

    const lyricsByVideoId = new Map();
    for (const lc of lyricsCandidates) {
      lyricsByVideoId.set(lc.video_id, lc);
    }

    // 3. Audit each track
    let correctAssociations = 0;
    let mismatchesDetected = 0;
    let candidatesRequiringReview = 0;
    let candidatesRejectedRights = 0;
    let lyricsVerified = 0;
    let lyricsNeedsReview = 0;
    let validAuthorizedAudio = 0;

    const auditedTracks = [];
    const mismatchesList = [];

    for (let i = 0; i < tracks.length; i++) {
      const officialTrack = tracks[i];
      const videoId = officialTrack.videoId || officialTrack.video_id;
      const expectedPosition = officialTrack.position !== undefined ? officialTrack.position : i;
      const trackId = officialTrack.trackId || officialTrack.id || `track_${videoId}`;

      const audioList = audioByVideoId.get(videoId) || [];
      const lyricsRow = lyricsByVideoId.get(videoId) || null;

      let trackHasIdentityMismatch = false;
      const mismatchReasons = [];

      // Check audio candidates identity
      for (const ac of audioList) {
        // Verify that the candidate was searched for the correct track title
        if (ac.title && officialTrack.title && ac.title.trim().toLowerCase() !== officialTrack.title.trim().toLowerCase()) {
          trackHasIdentityMismatch = true;
          mismatchReasons.push(`Audio candidate associated with "${ac.title}" but official playlist has "${officialTrack.title}" for video ID ${videoId}`);
        }

        // Apply Internet Archive rights audit
        if (ac.provider === 'internet_archive') {
          const rightsEval = this.classifyInternetArchiveRights(ac);

          // Update candidate in DB with audited rights
          await db.query(sql`
            UPDATE audio_candidates
            SET track_id = ${trackId},
                playlist_position = ${expectedPosition},
                original_title = ${officialTrack.title},
                original_artist = ${officialTrack.artist},
                rights_status = ${rightsEval.rightsStatus},
                rights_justification = ${rightsEval.rightsJustification},
                version_type = ${rightsEval.versionType},
                download_allowed = ${rightsEval.downloadAllowed ? 1 : 0},
                match_outcome = 'NEEDS_REVIEW'
            WHERE id = ${ac.id}
          `);

          ac.rights_status = rightsEval.rightsStatus;
          ac.rights_justification = rightsEval.rightsJustification;
          ac.version_type = rightsEval.versionType;
          ac.download_allowed = rightsEval.downloadAllowed ? 1 : 0;
          ac.match_outcome = 'NEEDS_REVIEW';

          if (rightsEval.rightsStatus !== 'SUPPORTED') {
            candidatesRejectedRights++;
          }
          candidatesRequiringReview++;
        } else {
          // Standard update for other providers
          await db.query(sql`
            UPDATE audio_candidates
            SET track_id = ${trackId},
                playlist_position = ${expectedPosition},
                original_title = ${officialTrack.title},
                original_artist = ${officialTrack.artist}
            WHERE id = ${ac.id}
          `);
        }
      }

      // Check lyrics identity & audit
      let auditedLyricsStatus = 'UNAVAILABLE';
      let lyricsNotes = '';
      if (lyricsRow) {
        if (lyricsRow.title && officialTrack.title && lyricsRow.title.trim().toLowerCase() !== officialTrack.title.trim().toLowerCase()) {
          trackHasIdentityMismatch = true;
          mismatchReasons.push(`Lyrics candidate associated with "${lyricsRow.title}" but official playlist has "${officialTrack.title}" for video ID ${videoId}`);
        }

        const lyricsEval = this.classifyLyricsIntegrity(officialTrack, lyricsRow);
        auditedLyricsStatus = lyricsEval.status;
        lyricsNotes = lyricsEval.verificationNotes;

        if (auditedLyricsStatus === 'VERIFIED_SYNCHRONIZED') lyricsVerified++;
        else if (auditedLyricsStatus === 'SYNCHRONIZED_NEEDS_REVIEW') lyricsNeedsReview++;

        // Update lyrics candidate in DB
        await db.query(sql`
          UPDATE lyrics_candidates
          SET track_id = ${trackId},
              playlist_position = ${expectedPosition},
              original_title = ${officialTrack.title},
              original_artist = ${officialTrack.artist},
              status = ${auditedLyricsStatus},
              timestamps_present = ${lyricsEval.timestampsPresent ? 1 : 0},
              verification_notes = ${lyricsNotes}
          WHERE id = ${lyricsRow.id}
        `);
      }

      if (trackHasIdentityMismatch) {
        mismatchesDetected++;
        mismatchesList.push({
          position: expectedPosition,
          videoId,
          officialTitle: officialTrack.title,
          officialArtist: officialTrack.artist,
          reasons: mismatchReasons,
        });
      } else {
        correctAssociations++;
      }

      auditedTracks.push({
        position: expectedPosition,
        trackId,
        videoId,
        title: officialTrack.title,
        artist: officialTrack.artist,
        hasAudioCandidates: audioList.length > 0,
        audioCandidatesCount: audioList.length,
        bestAudioCandidate: audioList.find(a => a.is_best) || audioList[0] || null,
        lyricsStatus: auditedLyricsStatus,
        lyricsNotes,
        hasMismatch: trackHasIdentityMismatch,
        mismatchReasons,
      });
    }

    // 4. Save audit summary to DB
    const auditId = crypto.randomUUID();
    const auditDataJson = JSON.stringify({
      tracks: auditedTracks,
      mismatches: mismatchesList,
    });

    await db.query(sql`
      INSERT INTO integrity_audits (
        id, scan_id, playlist_id, total_audited, correct_associations,
        mismatches_detected, candidates_requiring_review, candidates_rejected_rights,
        lyrics_verified, lyrics_needs_review, audit_data, created_at
      ) VALUES (
        ${auditId}, ${scanId}, ${'PLMeZARHzcGt0'}, ${tracks.length}, ${correctAssociations},
        ${mismatchesDetected}, ${candidatesRequiringReview}, ${candidatesRejectedRights},
        ${lyricsVerified}, ${lyricsNeedsReview}, ${auditDataJson}, ${Math.floor(Date.now() / 1000)}
      )
    `);

    console.log(`[DataIntegrity] Audit complete: ${correctAssociations}/${tracks.length} correct, ${mismatchesDetected} mismatches, ${candidatesRejectedRights} rejected rights.`);

    return {
      auditId,
      scanId,
      playlistId: 'PLMeZARHzcGt0',
      totalAudited: tracks.length,
      correctAssociations,
      mismatchesDetected,
      candidatesRequiringReview,
      candidatesRejectedRights,
      validAuthorizedAudio, // 0 - none have verified copyright owner authorization
      lyricsVerified,
      lyricsNeedsReview,
      mismatches: mismatchesList,
      tracks: auditedTracks,
    };
  }

  /**
   * Get the latest integrity audit for a scan.
   */
  async getAuditReport(scanId) {
    const db = getDB();
    const rows = await db.query(sql`
      SELECT * FROM integrity_audits WHERE scan_id = ${scanId} ORDER BY created_at DESC LIMIT 1
    `);
    if (rows.length === 0) return null;
    const r = rows[0];
    let parsedData = {};
    try {
      parsedData = JSON.parse(r.audit_data || '{}');
    } catch (_) {}

    return {
      id: r.id,
      scanId: r.scan_id,
      playlistId: r.playlist_id,
      totalAudited: r.total_audited,
      correctAssociations: r.correct_associations,
      mismatchesDetected: r.mismatches_detected,
      candidatesRequiringReview: r.candidates_requiring_review,
      candidatesRejectedRights: r.candidates_rejected_rights,
      lyricsVerified: r.lyrics_verified,
      lyricsNeedsReview: r.lyrics_needs_review,
      createdAt: new Date(r.created_at * 1000).toISOString(),
      mismatches: parsedData.mismatches || [],
      tracks: parsedData.tracks || [],
    };
  }
}

module.exports = new DataIntegrityService();
