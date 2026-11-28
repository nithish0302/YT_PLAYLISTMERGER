const express = require('express');
const downloadController = require('../controllers/downloadController');

const router = express.Router();

// Job lifecycle
router.post('/jobs', (req, res, next) => downloadController.createJob(req, res, next));
router.get('/jobs', (req, res, next) => downloadController.listJobs(req, res, next));
router.get('/jobs/:jobId', (req, res, next) => downloadController.getJob(req, res, next));
router.get('/jobs/:jobId/tracks', (req, res, next) => downloadController.getJobTracks(req, res, next));
router.get('/jobs/:jobId/progress', (req, res, next) => downloadController.getJobProgress(req, res, next));
router.get('/jobs/:jobId/validation-report', (req, res, next) => downloadController.getValidationReport(req, res, next));

// Queue controls
router.post('/jobs/:jobId/start', (req, res, next) => downloadController.startQueue(req, res, next));
router.post('/jobs/:jobId/pause', (req, res, next) => downloadController.pauseQueue(req, res, next));
router.post('/jobs/:jobId/resume', (req, res, next) => downloadController.resumeQueue(req, res, next));
router.post('/jobs/:jobId/cancel', (req, res, next) => downloadController.cancelQueue(req, res, next));
router.post('/jobs/:jobId/retry-failed', (req, res, next) => downloadController.retryFailed(req, res, next));
router.get('/jobs/:jobId/stats', (req, res, next) => downloadController.getDashboardStats(req, res, next));
router.get('/stats', (req, res, next) => downloadController.getDashboardStats(req, res, next));

// Individual track controls
router.post('/tracks/:trackId/download', (req, res, next) => downloadController.downloadIndividualTrack(req, res, next));
router.post('/tracks/:trackId/cancel', (req, res, next) => downloadController.cancelTrack(req, res, next));
router.post('/tracks/:trackId/retry', (req, res, next) => downloadController.retryTrack(req, res, next));

// Manual search & source confirmation
router.get('/tracks/:trackId/sources', (req, res, next) => downloadController.searchSources(req, res, next));
router.post('/tracks/:trackId/confirm-source', (req, res, next) => downloadController.confirmSource(req, res, next));

// Lyrics & manual confirmation
router.get('/tracks/:trackId/lyrics', (req, res, next) => downloadController.getLyrics(req, res, next));
router.post('/tracks/:trackId/confirm-lyrics', (req, res, next) => downloadController.confirmLyrics(req, res, next));

// ZIP export
router.get('/jobs/:jobId/export', (req, res, next) => downloadController.exportZip(req, res, next));

// Real-time Server-Sent Events (SSE)
router.get('/jobs/:jobId/events', (req, res) => downloadController.eventsStream(req, res));

module.exports = router;
