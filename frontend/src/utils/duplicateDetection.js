/**
 * Clean and normalize a song title by removing common YouTube music tags,
 * video quality tags, and feature tags.
 */
export function normalizeTitle(title) {
  if (!title) return '';
  let cleaned = title.toLowerCase();

  // Remove common parenthetical/bracketed suffixes
  cleaned = cleaned.replace(/\((official\s*(music\s*)?video|lyric\s*video|official\s*audio|audio|visualizer|remastered|video)\)/gi, '');
  cleaned = cleaned.replace(/\[(official\s*(music\s*)?video|lyric\s*video|official\s*audio|audio|visualizer|remastered|video|hd|4k)\]/gi, '');

  // Remove "ft.", "feat.", "featuring" and following artists
  cleaned = cleaned.replace(/\s+(feat\.|ft\.|featuring)\s+[^([]+/gi, '');

  // Remove special characters, keep alphanumeric and spaces
  cleaned = cleaned.replace(/[^\w\s]/g, ' ');

  // Collapse multiple whitespace
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Clean and normalize an artist name by removing channel tags like "- Topic", "VEVO", etc.
 */
export function normalizeArtist(artist) {
  if (!artist) return '';
  let cleaned = artist.toLowerCase();

  // Remove common YouTube artist channel suffixes
  cleaned = cleaned.replace(/\s*-\s*topic$/i, '');
  cleaned = cleaned.replace(/\s*vevo$/i, '');
  cleaned = cleaned.replace(/\s*official$/i, '');

  cleaned = cleaned.replace(/[^\w\s]/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

/**
 * Mode 1: Exact Duplicates (by YouTube video ID).
 * If the exact same video appears multiple times across or within playlists.
 */
export function findExactDuplicates(tracks) {
  const videoMap = new Map();

  for (const track of tracks) {
    if (track.isRemoved) continue;
    const existing = videoMap.get(track.videoId) || [];
    existing.push(track);
    videoMap.set(track.videoId, existing);
  }

  const groups = [];

  videoMap.forEach((groupTracks, videoId) => {
    if (groupTracks.length > 1) {
      groups.push({
        key: `exact_${videoId}`,
        type: 'exact',
        normalizedTitle: normalizeTitle(groupTracks[0].title),
        normalizedArtist: normalizeArtist(groupTracks[0].artist),
        tracks: groupTracks,
        keepIndex: 0, // default keep first occurrence
      });
    }
  });

  return groups;
}

/**
 * Mode 2: Possible Duplicates (by Normalized Title and Artist).
 * Detects songs that have DIFFERENT video IDs but identical/near-identical song name and artist.
 */
export function findPossibleDuplicates(tracks, excludeExactGroupVideoIds = new Set()) {
  const normMap = new Map();

  for (const track of tracks) {
    if (track.isRemoved) continue;
    const nTitle = normalizeTitle(track.title);
    const nArtist = normalizeArtist(track.artist);

    // Skip if title is too short to safely match
    if (!nTitle || nTitle.length < 2) continue;

    const key = `${nArtist}|||${nTitle}`;
    const list = normMap.get(key) || [];
    list.push(track);
    normMap.set(key, list);
  }

  const groups = [];

  normMap.forEach((groupTracks, key) => {
    // Only consider it a duplicate group if there are multiple DIFFERENT videoIds
    const uniqueVideoIds = new Set(groupTracks.map((t) => t.videoId));
    if (uniqueVideoIds.size > 1) {
      // Filter out tracks that are already handled as exact duplicates
      const filtered = groupTracks.filter((t) => !excludeExactGroupVideoIds.has(t.videoId));
      const filteredVideoIds = new Set(filtered.map((t) => t.videoId));

      if (filteredVideoIds.size > 1) {
        const [nArtist, nTitle] = key.split('|||');
        groups.push({
          key: `possible_${nTitle}_${nArtist}`,
          type: 'possible',
          normalizedTitle: nTitle,
          normalizedArtist: nArtist,
          tracks: filtered,
          keepIndex: 0,
        });
      }
    }
  });

  return groups;
}

/**
 * Compute real-time statistics for the duplicate manager.
 */
export function calculateDuplicateStats(allTracks, exactGroups, possibleGroups) {
  const activeTracks = allTracks.filter((t) => !t.isRemoved);
  const totalImported = allTracks.length;

  let exactDuplicates = 0;
  for (const group of exactGroups) {
    exactDuplicates += Math.max(0, group.tracks.length - 1);
  }

  let possibleDuplicates = 0;
  for (const group of possibleGroups) {
    possibleDuplicates += Math.max(0, group.tracks.length - 1);
  }

  const uniqueVideoIds = new Set(activeTracks.map((t) => t.videoId)).size;

  return {
    totalImported,
    uniqueTracks: uniqueVideoIds,
    exactDuplicates,
    possibleDuplicates,
    afterCleanup: activeTracks.length,
  };
}

/**
 * Automatically mark all exact duplicate copies as removed except the chosen keepIndex.
 */
export function removeExactDuplicates(tracks, exactGroups) {
  const idsToRemove = new Set();

  for (const group of exactGroups) {
    group.tracks.forEach((track, idx) => {
      if (idx !== group.keepIndex) {
        // Mark this track instance as removed
        idsToRemove.add(`${track.videoId}_${track.playlistId}_${track.position}`);
      }
    });
  }

  return tracks.map((track) => {
    const key = `${track.videoId}_${track.playlistId}_${track.position}`;
    if (idsToRemove.has(key)) {
      return { ...track, isRemoved: true, isDuplicate: true, duplicateType: 'exact' };
    }
    return track;
  });
}

/**
 * Apply user selections for possible duplicate groups.
 */
export function removeSelectedPossibleDuplicates(tracks, groups) {
  const idsToRemove = new Set();

  for (const group of groups) {
    group.tracks.forEach((track, idx) => {
      if (idx !== group.keepIndex) {
        idsToRemove.add(`${track.videoId}_${track.playlistId}_${track.position}`);
      }
    });
  }

  return tracks.map((track) => {
    const key = `${track.videoId}_${track.playlistId}_${track.position}`;
    if (idsToRemove.has(key)) {
      return { ...track, isRemoved: true, isDuplicate: true, duplicateType: 'possible' };
    }
    return track;
  });
}

/**
 * Restore all removed tracks.
 */
export function restoreAllTracks(tracks) {
  return tracks.map((t) => ({ ...t, isRemoved: false }));
}
