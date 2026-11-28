const express = require('express');
const libraryController = require('../controllers/libraryController');

const router = express.Router();

router.get('/snapshots', (req, res, next) => libraryController.listSnapshots(req, res, next));
router.get('/snapshots/:id', (req, res, next) => libraryController.getSnapshot(req, res, next));
router.post('/tag', (req, res, next) => libraryController.tagAudio(req, res, next));
router.post('/artwork/validate', (req, res, next) => libraryController.validateArtwork(req, res, next));
router.get('/jobs/:jobId/export', (req, res, next) => libraryController.exportLibrary(req, res, next));
router.post('/backup', (req, res, next) => libraryController.createBackup(req, res, next));
router.get('/backups', (req, res, next) => libraryController.listBackups(req, res, next));
router.post('/restore', (req, res, next) => libraryController.restoreBackup(req, res, next));

module.exports = router;
