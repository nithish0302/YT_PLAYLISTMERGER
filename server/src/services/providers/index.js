const JamendoProvider = require('./JamendoProvider');
const InternetArchiveProvider = require('./InternetArchiveProvider');
const CcMixterProvider = require('./CcMixterProvider');

const providers = {
  jamendo: new JamendoProvider(),
  internet_archive: new InternetArchiveProvider(),
  ccmixter: new CcMixterProvider(),
};

function getProvider(name = 'jamendo') {
  const normalized = (name || '').toLowerCase().replace(/[-\s]/g, '_');
  const p = providers[normalized];
  if (!p) {
    throw new Error(`Audio provider "${name}" is not registered.`);
  }
  return p;
}

function getAllProviders() {
  return Object.values(providers);
}

/**
 * Searches all registered authorized providers in parallel and aggregates candidates.
 * @param {Object} query - { title, artist, album, duration }
 * @param {string} [preferredFormat='flac']
 * @returns {Promise<Array<Object>>} Aggregated list of evaluated candidates
 */
async function searchAllProviders(query, preferredFormat = 'flac') {
  const providerList = getAllProviders();
  const searchPromises = providerList.map(async (provider) => {
    try {
      return await provider.findCandidates(query, preferredFormat);
    } catch (err) {
      console.warn(`[Providers] Search failed for ${provider.name}:`, err.message);
      return [];
    }
  });

  const results = await Promise.all(searchPromises);
  const flattened = results.flat();

  // Sort candidates: HIGH_CONFIDENCE first, then highest score
  flattened.sort((a, b) => {
    if (a.matchOutcome === 'HIGH_CONFIDENCE' && b.matchOutcome !== 'HIGH_CONFIDENCE') return -1;
    if (b.matchOutcome === 'HIGH_CONFIDENCE' && a.matchOutcome !== 'HIGH_CONFIDENCE') return 1;
    return (b.matchScore || 0) - (a.matchScore || 0);
  });

  return flattened;
}

module.exports = {
  providers,
  getProvider,
  getAllProviders,
  searchAllProviders,
};
