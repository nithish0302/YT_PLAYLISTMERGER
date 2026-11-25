import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Fetch all connected accounts */
export async function getAccounts() {
  const { data } = await api.get('/api/accounts');
  return data.accounts || [];
}

/** Get Google OAuth URL for popup or redirect */
export async function getAuthUrl(accountHint) {
  const { data } = await api.get('/auth/url', {
    params: accountHint ? { accountHint } : undefined,
  });
  return data.url;
}

/** Directly initiate Google OAuth in current window */
export function connectAccount(hint) {
  const url = new URL(`${API_BASE}/auth/connect`);
  if (hint) url.searchParams.set('accountHint', hint);
  window.location.href = url.toString();
}

/** Disconnect / remove a connected account */
export async function disconnectAccount(id) {
  await api.delete(`/api/accounts/${id}`);
}

/** Reconnect or refresh an account */
export async function reconnectAccount(id) {
  try {
    const { data } = await api.post(`/auth/refresh/${id}`);
    return { valid: Boolean(data.success) };
  } catch (err) {
    return { valid: false, error: err.response?.data?.error || err.message };
  }
}

/** Fetch playlists for a specific connected account */
export async function getAccountPlaylists(accountId) {
  const { data } = await api.get(`/api/playlists/account/${accountId}`);
  return data.playlists || [];
}

/** Fetch playlist details by URL */
export async function getPlaylistByUrl(url, accountId) {
  const { data } = await api.get('/api/playlists/url', {
    params: { url, accountId },
  });
  return data;
}

/** Fetch all tracks for a playlist */
export async function getPlaylistTracks(playlistId, accountId) {
  const { data } = await api.get(`/api/playlists/${playlistId}/tracks`, {
    params: accountId ? { accountId } : undefined,
  });
  return data.tracks || [];
}

/** Create the combined playlist on YouTube Music */
export async function createPlaylist(accountId, name, description, trackVideoIds) {
  const { data } = await api.post('/api/playlists/create', {
    accountId,
    name,
    description,
    trackVideoIds,
  });
  return data;
}

/** Check account token validity */
export async function checkAccountStatus(id) {
  const { data } = await api.get(`/api/accounts/${id}/status`);
  return data;
}

export default api;
