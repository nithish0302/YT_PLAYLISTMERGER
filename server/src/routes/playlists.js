const express = require('express');
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { getAccount, getAllAccounts, updateTokens } = require('../db');

const router = express.Router();

function getClientId() {
  return process.env.CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
}

function getClientSecret() {
  return process.env.CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
}

function getRedirectUri() {
  return process.env.REDIRECT_URI || 'http://localhost:3001/auth/callback';
}

function createOAuthClient() {
  return new OAuth2Client(getClientId(), getClientSecret(), getRedirectUri());
}

/**
 * Load an account from DB, refresh its access token if expired,
 * and return an authenticated YouTube API client.
 */
async function getAuthorizedClient(accountId) {
  const account = await getAccount(accountId);
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });

  const client = createOAuthClient();
  client.setCredentials({
    access_token:  account.access_token,
    refresh_token: account.refresh_token,
    expiry_date:   account.token_expiry,
  });

  const fiveMin = 5 * 60 * 1000;
  if (!account.token_expiry || Date.now() > account.token_expiry - fiveMin) {
    if (account.refresh_token) {
      try {
        const { credentials } = await client.refreshAccessToken();
        client.setCredentials(credentials);
        await updateTokens(
          accountId,
          credentials.access_token,
          credentials.refresh_token || account.refresh_token,
          credentials.expiry_date
        );
      } catch (err) {
        console.warn(`[Playlists] Token refresh failed for ${accountId}:`, err.message);
      }
    }
  }

  return google.youtube({ version: 'v3', auth: client });
}

/**
 * Extract YouTube playlist ID from URLs, music.youtube.com URLs, or bare IDs.
 */
function extractPlaylistId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : 'https://' + trimmed);
    const listParam = url.searchParams.get('list');
    if (listParam) return listParam;
  } catch {
    // not a valid URL
  }
  // Standard YouTube playlist IDs: PL..., RD..., OLAK5uy_..., etc.
  if (/^[A-Za-z0-9_-]{10,}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Fetch ALL pages of a paginated YouTube API call.
 */
async function fetchAllPages(apiFn, itemsFn) {
  const all = [];
  let pageToken;
  do {
    const response = await apiFn(pageToken);
    const items = itemsFn(response) || [];
    all.push(...items);
    pageToken = response.data.nextPageToken;
  } while (pageToken);
  return all;
}

// ── GET /api/playlists/account/:accountId ─────────────────────────────────────
router.get('/account/:accountId', async (req, res) => {
  try {
    const youtube = await getAuthorizedClient(req.params.accountId);

    const items = await fetchAllPages(
      (pageToken) =>
        youtube.playlists.list({
          part: ['snippet', 'contentDetails'],
          mine: true,
          maxResults: 50,
          ...(pageToken ? { pageToken } : {}),
        }),
      (r) => r.data.items
    );

    const playlists = (items || []).map((item) => ({
      id:           item.id,
      title:        item.snippet?.title || 'Untitled Playlist',
      description:  item.snippet?.description || '',
      thumbnail:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url || '',
      itemCount:    item.contentDetails?.itemCount || 0,
      channelTitle: item.snippet?.channelTitle || '',
      sourceAccountId: req.params.accountId,
      sourceType: 'account',
    }));

    res.json({ playlists });
  } catch (err) {
    console.error('[Playlists] account fetch error:', err);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── GET /api/playlists/url & /api/playlists/by-url ───────────────────────────
async function handleUrlFetch(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url query param is required' });

  const playlistId = extractPlaylistId(url);
  if (!playlistId) {
    return res.status(400).json({
      error: 'Could not extract playlist ID from URL. Please provide a valid YouTube or YouTube Music playlist link (containing "?list=...")'
    });
  }

  async function tryFetch(youtube) {
    const response = await youtube.playlists.list({
      part: ['snippet', 'contentDetails'],
      id: [playlistId],
      maxResults: 1,
    });
    const item = response.data.items?.[0];
    if (!item) return null;
    return {
      id:           item.id,
      title:        item.snippet?.title || 'Untitled Playlist',
      description:  item.snippet?.description || '',
      thumbnail:
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url || '',
      itemCount:    item.contentDetails?.itemCount || 0,
      channelTitle: item.snippet?.channelTitle || '',
      sourceType:   'url',
      sourceUrl:    url,
    };
  }

  try {
    // 1. If an accountId query parameter was passed, try that first
    if (req.query.accountId) {
      try {
        const yt = await getAuthorizedClient(req.query.accountId);
        const result = await tryFetch(yt);
        if (result) return res.json(result);
      } catch (e) {
        console.warn(`[Playlists] Account ${req.query.accountId} failed to access playlist:`, e.message);
      }
    }

    // 2. Try with API key if configured
    if (process.env.YOUTUBE_API_KEY) {
      try {
        const yt = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
        const result = await tryFetch(yt);
        if (result) return res.json(result);
      } catch (e) {
        console.warn('[Playlists] API key fetch failed:', e.message);
      }
    }

    // 3. Fall back to any connected accounts
    const accounts = await getAllAccounts();
    for (const account of accounts) {
      try {
        const yt = await getAuthorizedClient(account.id);
        const result = await tryFetch(yt);
        if (result) return res.json(result);
      } catch {
        continue;
      }
    }

    return res.status(404).json({
      error: 'Playlist not found or is private. If this is a private playlist, please connect the Google account that owns it first.'
    });
  } catch (err) {
    console.error('[Playlists] URL fetch error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.get('/url', handleUrlFetch);
router.get('/by-url', handleUrlFetch);

// ── GET /api/playlists/:playlistId/tracks ─────────────────────────────────────
router.get('/:playlistId/tracks', async (req, res) => {
  const { playlistId } = req.params;
  const { accountId } = req.query;

  let youtube = null;
  try {
    if (accountId) {
      youtube = await getAuthorizedClient(accountId);
    } else {
      const accounts = await getAllAccounts();
      if (accounts.length > 0) {
        youtube = await getAuthorizedClient(accounts[0].id);
      } else if (process.env.YOUTUBE_API_KEY) {
        youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });
      } else {
        return res.status(401).json({
          error: 'No connected accounts available. Please connect a Google account to access YouTube Data API.'
        });
      }
    }
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  try {
    const items = await fetchAllPages(
      (pageToken) =>
        youtube.playlistItems.list({
          part: ['snippet', 'contentDetails'],
          playlistId,
          maxResults: 50,
          ...(pageToken ? { pageToken } : {}),
        }),
      (r) => r.data.items
    );

    const tracks = (items || [])
      .filter((item) => {
        // Exclude deleted or private unavailable videos
        const title = item.snippet?.title || '';
        return title !== 'Private video' && title !== 'Deleted video';
      })
      .map((item, index) => {
        const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
        const title = item.snippet?.title || 'Unknown Title';
        const artist = item.snippet?.videoOwnerChannelTitle || item.snippet?.channelTitle || 'Unknown Artist';
        return {
          videoId,
          title,
          artist,
          album: '',
          thumbnail:
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url || '',
          position: item.snippet?.position ?? index,
          playlistId: item.snippet?.playlistId || playlistId,
          duration: null,
        };
      })
      .filter((t) => t.videoId);

    res.json({ tracks, total: tracks.length });
  } catch (err) {
    console.error('[Playlists] tracks fetch error:', err);
    const msg = err.errors?.[0]?.message || err.message;
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/playlists/create & POST /api/playlists ──────────────────────────
async function handleCreatePlaylist(req, res) {
  const { accountId, name, description, trackVideoIds } = req.body;

  if (!accountId) return res.status(400).json({ error: 'accountId is required' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Playlist name is required' });

  const videoIds = Array.isArray(trackVideoIds) ? trackVideoIds.filter(Boolean) : [];

  let youtube;
  try {
    youtube = await getAuthorizedClient(accountId);
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  try {
    // 1. Create playlist
    const createResponse = await youtube.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title:       name.trim(),
          description: (description || 'Combined with Playlist Centralizer').trim(),
        },
        status: { privacyStatus: 'private' },
      },
    });

    const newPlaylistId = createResponse.data.id;
    console.log(`[Playlists] Created playlist "${name}" -> ID: ${newPlaylistId}`);

    // 2. Add tracks with rate-limiting and error tracking
    let added = 0;
    const failedTracks = [];

    for (let i = 0; i < videoIds.length; i++) {
      const videoId = videoIds[i];
      try {
        await youtube.playlistItems.insert({
          part: ['snippet'],
          requestBody: {
            snippet: {
              playlistId: newPlaylistId,
              resourceId: { kind: 'youtube#video', videoId },
            },
          },
        });
        added++;
      } catch (itemErr) {
        console.warn(`[Playlists] Failed to insert track ${videoId}:`, itemErr.message);
        const reason = itemErr?.errors?.[0]?.reason || itemErr.message;
        failedTracks.push({ videoId, reason });

        if (reason === 'quotaExceeded') {
          console.error('[Playlists] YouTube API Quota Exceeded!');
          return res.status(429).json({
            error: 'YouTube API quota exceeded for today. Playlist was created with partial tracks.',
            playlistId: newPlaylistId,
            url: `https://music.youtube.com/playlist?list=${newPlaylistId}`,
            youtubeUrl: `https://www.youtube.com/playlist?list=${newPlaylistId}`,
            added,
            failed: videoIds.length - added,
            failedTracks,
          });
        }
      }

      // Small pacing delay to avoid burst limits
      if (i % 5 === 0 && i > 0) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const playlistUrl = `https://music.youtube.com/playlist?list=${newPlaylistId}`;
    const youtubeUrl = `https://www.youtube.com/playlist?list=${newPlaylistId}`;

    res.json({
      success: true,
      playlistId: newPlaylistId,
      url: playlistUrl,
      youtubeUrl,
      added,
      failed: failedTracks.length,
      failedTracks,
      total: videoIds.length,
    });
  } catch (err) {
    console.error('[Playlists] Create playlist fatal error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.post('/create', handleCreatePlaylist);
router.post('/', handleCreatePlaylist);

module.exports = router;
