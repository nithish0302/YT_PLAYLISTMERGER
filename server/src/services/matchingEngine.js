/**
 * Common Matching Engine for Audio Providers
 * Evaluates candidate matches against track queries with version, recording type, and confidence analysis.
 */

const VERSION_KEYWORDS = [
  'remix',
  'acoustic',
  'live',
  'radio edit',
  'cover',
  'instrumental',
  'extended',
  'original',
  'karaoke',
  'tribute',
  'orchestral',
  'piano',
  'slowed',
  'reverb',
  'nightcore',
  'mashup',
  'bootleg',
  'dub',
];

/**
 * Normalizes strings by lowercasing, stripping bracketed YouTube metadata, and removing punctuation.
 */
function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\s*[\(\[](official\s*(music\s*)?video|video|audio|lyrics?|lyric\s*video|hd|4k|remastered|visualizer)[\)\]]/gi, '')
    .replace(/\s*-\s*official\s*(music\s*)?video/gi, '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts version keywords present in a text string.
 */
function extractVersionKeywords(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return VERSION_KEYWORDS.filter((keyword) => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(lower);
  });
}

/**
 * Computes Jaccard/token similarity between two strings (0.0 to 1.0).
 */
function stringSimilarity(str1, str2) {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return Math.max(0.75, minLen / maxLen);
  }

  const tokens1 = new Set(s1.split(' ').filter(Boolean));
  const tokens2 = new Set(s2.split(' ').filter(Boolean));

  let intersection = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection++;
  }

  const union = new Set([...tokens1, ...tokens2]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Evaluates a candidate match against target track metadata.
 * Returns { outcome, score, reasons, versionDiscrepancies }
 * Outcome is one of: 'HIGH_CONFIDENCE' | 'NEEDS_REVIEW' | 'NO_MATCH'
 */
function evaluateMatch(query, candidate) {
  if (!candidate) {
    return {
      outcome: 'NO_MATCH',
      score: 0,
      reasons: ['No candidate provided.'],
      versionDiscrepancies: [],
    };
  }

  if (candidate.downloadAllowed === false) {
    return {
      outcome: 'NO_MATCH',
      score: 0,
      reasons: ['Download not permitted by provider or license.'],
      versionDiscrepancies: [],
    };
  }

  const reasons = [];
  const queryTitleKeywords = extractVersionKeywords(query.title);
  const candidateTitleKeywords = extractVersionKeywords(candidate.title);

  // Check version discrepancies (e.g. candidate is a remix, cover, acoustic, or live version)
  const candidateExtraKeywords = candidateTitleKeywords.filter(
    (k) => !queryTitleKeywords.includes(k)
  );

  const titleSim = stringSimilarity(query.title, candidate.title);
  const artistSim = query.artist ? stringSimilarity(query.artist, candidate.artist) : 0.5;

  let baseScore = (titleSim * 0.7) + (artistSim * 0.3);

  // Duration comparison if both are present
  if (query.duration && candidate.duration) {
    const diff = Math.abs(query.duration - candidate.duration);
    if (diff <= 5) {
      baseScore += 0.05;
      reasons.push(`Duration matches within ${diff}s.`);
    } else if (diff > 30) {
      baseScore -= 0.2;
      reasons.push(`Duration discrepancy (${diff}s difference).`);
    }
  }

  baseScore = Math.min(1.0, Math.max(0.0, baseScore));

  const versionDiscrepancies = [];
  if (candidateExtraKeywords.length > 0) {
    candidateExtraKeywords.forEach((k) => {
      versionDiscrepancies.push(`Candidate is identified as ${k.toUpperCase()} but query did not request it.`);
    });
  }

  // Determine outcome
  let outcome = 'NO_MATCH';

  if (titleSim < 0.6 || baseScore < 0.55) {
    outcome = 'NO_MATCH';
    reasons.push('Title or overall similarity below acceptable threshold.');
  } else if (versionDiscrepancies.length > 0) {
    // RULE: Never automatically accept a cover, remix, or live recording as original studio recording
    outcome = 'NEEDS_REVIEW';
    reasons.push(...versionDiscrepancies);
    reasons.push('Requires manual user review due to version differences.');
  } else if (baseScore >= 0.82 && titleSim >= 0.8) {
    outcome = 'HIGH_CONFIDENCE';
    reasons.push('High confidence match on title, artist, and version type.');
  } else {
    // Moderate similarity (0.55 to 0.82)
    outcome = 'NEEDS_REVIEW';
    reasons.push('Moderate confidence match. User verification recommended.');
  }

  return {
    outcome,
    score: Math.round(baseScore * 100) / 100,
    titleSimilarity: Math.round(titleSim * 100) / 100,
    artistSimilarity: Math.round(artistSim * 100) / 100,
    reasons,
    versionDiscrepancies,
  };
}

const OUTCOMES = {
  HIGH_CONFIDENCE: 'HIGH_CONFIDENCE',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  NO_MATCH: 'NO_MATCH',
};

module.exports = {
  OUTCOMES,
  VERSION_KEYWORDS,
  normalizeString,
  extractVersionKeywords,
  stringSimilarity,
  evaluateMatch,
};
