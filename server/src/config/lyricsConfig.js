/**
 * Centralized Lyrics Matching & Verification Policy Configuration
 * Phase 7 Hardening & Reliability Specification
 */

module.exports = {
  // Duration Matching Boundaries (in seconds)
  // Delta <= 2.0s: Eligible for automatic technical synchronization verification
  DURATION_VERIFIED_TOLERANCE_SEC: 2.0,

  // Delta 2.0s < delta <= 4.0s: Ambiguous variance zone (requires review)
  // Delta > 4.0s: Substantial duration mismatch (requires review)
  DURATION_VARIANCE_ZONE_SEC: 4.0,

  // Confidence Thresholds
  // MIN_CONFIDENCE_VERIFIED: Minimum title/artist string match confidence required for automatic sync verification.
  // Justification for 0.82:
  // Title and artist similarity weighting assigns 70% to title and 30% to artist.
  // Real-world YouTube playlist titles frequently contain parenthetical collaborator credits
  // (e.g. "lovely (with Khalid)" vs LRCLIB title "lovely", scoring 0.82-0.84).
  // A threshold of 0.85 falsely flags genuine acoustic matches as ambiguous, whereas 0.82
  // safely accepts genuine recordings while rigorously excluding remixed or derivative tracks (which score < 0.70).
  MIN_CONFIDENCE_VERIFIED: parseFloat(process.env.LYRICS_MIN_CONFIDENCE || '0.82'),

  // Minimum confidence to accept a candidate at all (below this threshold, candidate is rejected to UNAVAILABLE)
  MIN_CONFIDENCE_ACCEPT: 0.55,

  // Supported Lyrics Statuses
  STATUS: {
    VERIFIED_SYNCHRONIZED: 'VERIFIED_SYNCHRONIZED',
    SYNCHRONIZED_NEEDS_REVIEW: 'SYNCHRONIZED_NEEDS_REVIEW',
    USER_CONFIRMED_MATCH: 'USER_CONFIRMED_MATCH',
    PLAIN: 'PLAIN',
    UNAVAILABLE: 'UNAVAILABLE',
    INSTRUMENTAL: 'INSTRUMENTAL',
  },

  // Version keywords that must never be auto-matched to a standard studio recording
  DISCREPANCY_KEYWORDS: [
    'remix',
    'cover',
    'live',
    'acoustic',
    'instrumental',
    'karaoke',
    'nightcore',
    'slowed',
    'reverb',
    'speed up',
    'edit',
    'tribute',
  ],
};
