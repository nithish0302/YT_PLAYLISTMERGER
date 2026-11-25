import axios from 'axios';
import type { Account, Playlist, Track, CreatePlaylistResult } from '../types';

const API_BASE = 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

/** Fetch all connected accounts */
export async function getAccounts(): Promise<Account[]> {
  const { data } = await api.get<{ accounts: Account[] }>('/api/accounts');
  return data.accounts || [];
}

/** Get Google OAuth URL for popup or redirect */
export async function getAuthUrl(accountHint?: string): Promise<string> {
  const { data } = await api.get<{ url: string }>('/auth/url', {
    params: accountHint ? { accountHint } : undefined,
  });
  return data.url;
}

/** Directly initiate Google OAuth in current window */
export function connectAccount(hint?: string): void {
  const url = new URL(`${API_BASE}/auth/connect`);
  if (hint) url.searchParams.set('accountHint', hint);
  window.location.href = url.toString();
}

/** Disconnect / remove a connected account */
export async function disconnectAccount(id: string): Promise<void> {
  await api.delete(`/api/accounts/${id}`);
}

/** Reconnect or refresh an account */
export async function reconnectAccount(id: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const { data } = await api.post(`/auth/refresh/${id}`);
    return { valid: Boolean(data.success) };
  } catch (err: any) {
    return { valid: false, error: err.response?.data?.error || err.message };
  }
}

/** Fetch playlists for a specific connected account */
export async function getAccountPlaylists(accountId: string): Promise<Playlist[]> {
  const { data } = await api.get<{ playlists: Playlist[] }>(`/api/playlists/account/${accountId}`);
  return data.playlists || [];
}

/** Fetch playlist details by URL */
export async function getPlaylistByUrl(url: string, accountId?: string): Promise<Playlist> {
  const { data } = await api.get<Playlist>('/api/playlists/url', {
    params: { url, accountId },
  });
  return data;
}

/** Fetch all tracks for a playlist */
export async function getPlaylistTracks(playlistId: string, accountId?: string): Promise<Track[]> {
  const { data } = await api.get<{ tracks: Track[]; total: number }>(`/api/playlists/${playlistId}/tracks`, {
    params: accountId ? { accountId } : undefined,
  });
  return data.tracks || [];
}

/** Create the combined playlist on YouTube Music */
export async function createPlaylist(
  accountId: string,
  name: string,
  description: string,
  trackVideoIds: string[]
): Promise<CreatePlaylistResult> {
  const { data } = await api.post<CreatePlaylistResult>('/api/playlists/create', {
    accountId,
    name,
    description,
    trackVideoIds,
  });
  return data;
}

/** Check account token validity */
export async function checkAccountStatus(id: string): Promise<{ valid: boolean; status?: string }> {
  const { data } = await api.get<{ valid: boolean; status?: string }>(`/api/accounts/${id}/status`);
  return data;
}

export default api;
