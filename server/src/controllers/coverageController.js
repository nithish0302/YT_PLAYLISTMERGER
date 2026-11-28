const coverageScannerService = require('../services/coverageScannerService');
const dataIntegrityService = require('../services/dataIntegrityService');
const { getDB, sql } = require('../db');

class CoverageController {
  /**
   * POST /api/coverage/scans
   * Create and start a coverage scan for a playlist.
   */
  async createScan(req, res, next) {
    try {
      const { playlistId, playlistTitle, tracks } = req.body;
      if (!tracks || !Array.isArray(tracks) || tracks.length === 0) {
        return res.status(400).json({ error: 'Tracks array is required.' });
      }

      const scan = await coverageScannerService.createScan({ playlistId, playlistTitle, tracks });

      // Start scan in background (non-blocking)
      coverageScannerService.runScan(scan.id, tracks).catch(err => {
        console.error(`[CoverageController] Background scan error:`, err.message);
      });

      res.status(201).json(scan);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/coverage/scans
   * List all coverage scans.
   */
  async listScans(req, res, next) {
    try {
      const scans = await coverageScannerService.getAllScans();
      res.json({ scans });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/coverage/scans/:scanId
   * Get scan status.
   */
  async getScan(req, res, next) {
    try {
      const { scanId } = req.params;
      const scan = await coverageScannerService.getScan(scanId);
      if (!scan) return res.status(404).json({ error: 'Scan not found' });
      res.json(scan);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/coverage/scans/:scanId/cancel
   * Cancel a running scan.
   */
  async cancelScan(req, res, next) {
    try {
      const { scanId } = req.params;
      coverageScannerService.cancelScan(scanId);
      res.json({ success: true, message: 'Scan cancellation requested.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/coverage/scans/:scanId/resume
   * Resume an interrupted scan.
   */
  async resumeScan(req, res, next) {
    try {
      const { scanId } = req.params;
      const { tracks } = req.body;
      if (!tracks || !Array.isArray(tracks)) {
        return res.status(400).json({ error: 'Tracks array is required for resume.' });
      }

      coverageScannerService.resumeScan(scanId, tracks).catch(err => {
        console.error(`[CoverageController] Resume scan error:`, err.message);
      });

      res.json({ success: true, message: 'Scan resume started.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/coverage/scans/:scanId/report
   * Get the full coverage report.
   */
  async getReport(req, res, next) {
    try {
      const { scanId } = req.params;
      const report = await coverageScannerService.buildCoverageReport(scanId);
      res.json(report);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/coverage/scans/:scanId/tracks/:videoId
   * Get detailed candidates for a specific track.
   */
  async getTrackDetails(req, res, next) {
    try {
      const { scanId, videoId } = req.params;
      const details = await coverageScannerService.getTrackCandidates(scanId, videoId);
      res.json(details);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/coverage/candidates/:candidateId/confirm
   * Manually confirm a candidate.
   */
  async confirmCandidate(req, res, next) {
    try {
      const { candidateId } = req.params;
      await coverageScannerService.confirmCandidate(candidateId);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/coverage/scans/:scanId/export
   * Export track-by-track coverage results as JSON.
   */
  async exportReport(req, res, next) {
    try {
      const { scanId } = req.params;
      const report = await coverageScannerService.buildCoverageReport(scanId);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="coverage_report_${scanId}.json"`);
      res.json(report);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/coverage/scans/:scanId/audit
   * Retrieve latest data integrity audit report for a scan.
   */
  async getAudit(req, res, next) {
    try {
      const { scanId } = req.params;
      let audit = await dataIntegrityService.getAuditReport(scanId);
      if (!audit) {
        audit = await dataIntegrityService.runAudit(scanId);
      }
      res.json(audit);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/coverage/scans/:scanId/audit
   * Execute an explicit data integrity audit for a scan.
   */
  async runAudit(req, res, next) {
    try {
      const { scanId } = req.params;
      const { officialTracks } = req.body || {};
      const audit = await dataIntegrityService.runAudit(scanId, officialTracks);
      res.json(audit);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/coverage/scans/:scanId/export-csv
   * Export track-by-track CSV.
   */
  async exportCsv(req, res, next) {
    try {
      const { scanId } = req.params;
      const report = await coverageScannerService.buildCoverageReport(scanId);

      const headers = [
        'Position', 'Track ID', 'Video ID', 'Title', 'Artist', 'Audio Status', 'Best Provider',
        'Rights Status', 'Version Type', 'Match Confidence', 'Match Outcome', 'License',
        'Format', 'Quality Tier', 'Download Allowed', 'Lyrics Status', 'Verification Notes',
        'Total Candidates', 'User Confirmed', 'Rejection Reason'
      ];

      const rows = report.tracks.map((t, idx) => [
        t.position !== null && t.position !== undefined ? t.position : idx,
        t.trackId || '',
        t.videoId,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        `"${(t.artist || '').replace(/"/g, '""')}"`,
        t.audioStatus,
        t.bestCandidate?.provider || '',
        t.bestCandidate?.rightsStatus || '',
        t.bestCandidate?.versionType || '',
        t.bestCandidate?.matchScore || '',
        t.bestCandidate?.matchOutcome || '',
        `"${(t.bestCandidate?.licenseName || '').replace(/"/g, '""')}"`,
        t.bestCandidate?.format || '',
        t.bestCandidate?.qualityTier || '',
        t.bestCandidate?.downloadAllowed ? 'Yes' : 'No',
        t.lyricsStatus,
        `"${(t.verificationNotes || '').replace(/"/g, '""')}"`,
        t.totalCandidates,
        t.userConfirmed ? 'Yes' : 'No',
        `"${(t.rejectionReason || '').replace(/"/g, '""')}"`,
      ].join(','));

      const csv = [headers.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="coverage_report_${scanId}.csv"`);
      res.send(csv);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CoverageController();
