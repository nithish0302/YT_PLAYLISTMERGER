const express = require('express');
const coverageController = require('../controllers/coverageController');

const router = express.Router();

// Scan lifecycle
router.post('/scans', (req, res, next) => coverageController.createScan(req, res, next));
router.get('/scans', (req, res, next) => coverageController.listScans(req, res, next));
router.get('/scans/:scanId', (req, res, next) => coverageController.getScan(req, res, next));
router.post('/scans/:scanId/cancel', (req, res, next) => coverageController.cancelScan(req, res, next));
router.post('/scans/:scanId/resume', (req, res, next) => coverageController.resumeScan(req, res, next));

// Reports & Audit
router.get('/scans/:scanId/report', (req, res, next) => coverageController.getReport(req, res, next));
router.get('/scans/:scanId/audit', (req, res, next) => coverageController.getAudit(req, res, next));
router.post('/scans/:scanId/audit', (req, res, next) => coverageController.runAudit(req, res, next));
router.get('/scans/:scanId/export', (req, res, next) => coverageController.exportReport(req, res, next));
router.get('/scans/:scanId/export-csv', (req, res, next) => coverageController.exportCsv(req, res, next));

// Track details
router.get('/scans/:scanId/tracks/:videoId', (req, res, next) => coverageController.getTrackDetails(req, res, next));

// Manual confirmation
router.post('/candidates/:candidateId/confirm', (req, res, next) => coverageController.confirmCandidate(req, res, next));

module.exports = router;
