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

// ── Download Manager API ──────────────────────────────────────────────────────

/** Create a new download job */
export async function createDownloadJob({ playlistId, playlistTitle, tracks }) {
  const { data } = await api.post('/api/downloads/jobs', {
    playlistId,
    playlistTitle,
    tracks,
  });
  return data;
}

/** List recent download jobs */
export async function getDownloadJobs() {
  const { data } = await api.get('/api/downloads/jobs');
  return data.jobs || [];
}

/** Get a download job by ID */
export async function getDownloadJob(jobId) {
  const { data } = await api.get(`/api/downloads/jobs/${jobId}`);
  return data;
}

/** Get tracks for a download job */
export async function getDownloadJobTracks(jobId, status) {
  const { data } = await api.get(`/api/downloads/jobs/${jobId}/tracks`, {
    params: status ? { status } : undefined,
  });
  return data.tracks || [];
}

/** Get real-time job progress */
export async function getDownloadJobProgress(jobId) {
  const { data } = await api.get(`/api/downloads/jobs/${jobId}/progress`);
  return data;
}

/** Start download queue */
export async function startDownloadQueue(jobId) {
  const { data } = await api.post(`/api/downloads/jobs/${jobId}/start`);
  return data;
}

/** Pause download queue */
export async function pauseDownloadQueue(jobId) {
  const { data } = await api.post(`/api/downloads/jobs/${jobId}/pause`);
  return data;
}

/** Resume download queue */
export async function resumeDownloadQueue(jobId) {
  const { data } = await api.post(`/api/downloads/jobs/${jobId}/resume`);
  return data;
}

/** Cancel entire download queue */
export async function cancelDownloadQueue(jobId) {
  const { data } = await api.post(`/api/downloads/jobs/${jobId}/cancel`);
  return data;
}

/** Get dashboard statistics for a job */
export async function getDownloadJobStats(jobId) {
  const { data } = await api.get(jobId ? `/api/downloads/jobs/${jobId}/stats` : '/api/downloads/stats');
  return data;
}

/** Retry all failed tracks */
export async function retryFailedDownloads(jobId) {
  const { data } = await api.post(`/api/downloads/jobs/${jobId}/retry-failed`);
  return data;
}

/** Download an individual track */
export async function downloadTrack(trackId) {
  const { data } = await api.post(`/api/downloads/tracks/${trackId}/download`);
  return data;
}

/** Cancel a track download */
export async function cancelTrackDownload(trackId) {
  const { data } = await api.post(`/api/downloads/tracks/${trackId}/cancel`);
  return data;
}

/** Retry an individual track */
export async function retryTrackDownload(trackId) {
  const { data } = await api.post(`/api/downloads/tracks/${trackId}/retry`);
  return data;
}

/** Search authorized audio candidates for manual match */
export async function searchTrackSources(trackId) {
  const { data } = await api.get(`/api/downloads/tracks/${trackId}/sources`);
  return data.candidates || [];
}

/** Confirm an authorized audio match */
export async function confirmTrackSource(trackId, { provider, sourceTrackId }) {
  const { data } = await api.post(`/api/downloads/tracks/${trackId}/confirm-source`, {
    provider,
    sourceTrackId,
  });
  return data;
}

/** Get import validation report */
export async function getImportValidationReport(jobId) {
  const { data } = await api.get(`/api/downloads/jobs/${jobId}/validation-report`);
  return data;
}

/** Get lyrics metadata for a track */
export async function getTrackLyrics(trackId) {
  const { data } = await api.get(`/api/downloads/tracks/${trackId}/lyrics`);
  return data;
}

/** Confirm or reject ambiguous lyrics match */
export async function confirmTrackLyrics(trackId, confirmed) {
  const { data } = await api.post(`/api/downloads/tracks/${trackId}/confirm-lyrics`, {
    confirmed,
  });
  return data;
}

/** Get ZIP export direct download URL */
export function getExportZipUrl(jobId) {
  return `${API_BASE}/api/downloads/jobs/${jobId}/export`;
}

/** Get EventSource connection for live SSE updates */
export function createDownloadEventSource(jobId) {
  return new EventSource(`${API_BASE}/api/downloads/jobs/${jobId}/events`, {
    withCredentials: true,
  });
}

/** Get snapshots list */
export async function getSnapshots(playlistId) {
  const { data } = await api.get('/api/library/snapshots', {
    params: playlistId ? { playlistId } : undefined,
  });
  return data.snapshots || [];
}

/** Get specific snapshot by ID */
export async function getSnapshot(id) {
  const { data } = await api.get(`/api/library/snapshots/${id}`);
  return data;
}

export default api;

// ── Coverage Scanner API ──────────────────────────────────────────────────────

/** Create and start a new coverage scan */
export async function createCoverageScan({ playlistId, playlistTitle, tracks }) {
  const { data } = await api.post('/api/coverage/scans', { playlistId, playlistTitle, tracks });
  return data;
}

/** List all coverage scans */
export async function getCoverageScans() {
  const { data } = await api.get('/api/coverage/scans');
  return data.scans || [];
}

/** Get scan status */
export async function getCoverageScan(scanId) {
  const { data } = await api.get(`/api/coverage/scans/${scanId}`);
  return data;
}

/** Cancel a running scan */
export async function cancelCoverageScan(scanId) {
  const { data } = await api.post(`/api/coverage/scans/${scanId}/cancel`);
  return data;
}

/** Resume an interrupted scan */
export async function resumeCoverageScan(scanId, tracks) {
  const { data } = await api.post(`/api/coverage/scans/${scanId}/resume`, { tracks });
  return data;
}

/** Get full coverage report */
export async function getCoverageReport(scanId) {
  const { data } = await api.get(`/api/coverage/scans/${scanId}/report`);
  return data;
}

/** Get track-level candidates */
export async function getCoverageTrackDetails(scanId, videoId) {
  const { data } = await api.get(`/api/coverage/scans/${scanId}/tracks/${videoId}`);
  return data;
}

/** Confirm a candidate manually */
export async function confirmCoverageCandidate(candidateId) {
  const { data } = await api.post(`/api/coverage/candidates/${candidateId}/confirm`);
  return data;
}

/** Get JSON export URL */
export function getCoverageExportUrl(scanId) {
  return `${API_BASE}/api/coverage/scans/${scanId}/export`;
}

/** Get CSV export URL */
export function getCoverageCsvUrl(scanId) {
  return `${API_BASE}/api/coverage/scans/${scanId}/export-csv`;
}

/** Get data integrity audit report */
export async function getCoverageAudit(scanId) {
  const { data } = await api.get(`/api/coverage/scans/${scanId}/audit`);
  return data;
}

/** Trigger explicit data integrity audit */
export async function runCoverageAudit(scanId, officialTracks) {
  const { data } = await api.post(`/api/coverage/scans/${scanId}/audit`, { officialTracks });
  return data;
}
