import React, { useState } from 'react';
import {
  Download,
  Link2,
  Users,
  Search,
  Loader2,
  AlertCircle,
  HelpCircle,
  ListMusic,
  CheckCircle,
} from 'lucide-react';
import PlaylistCard from './PlaylistCard';
import type { Account, Playlist } from '../../types';
import { getAccountPlaylists, getPlaylistByUrl } from '../../api';

interface ImportSectionProps {
  accounts: Account[];
  selectedPlaylists: Playlist[];
  onAddPlaylist: (playlist: Playlist) => void;
  onRemovePlaylist: (playlistId: string) => void;
  onProceedToSelected: () => void;
}

export const ImportSection: React.FC<ImportSectionProps> = ({
  accounts,
  selectedPlaylists,
  onAddPlaylist,
  onRemovePlaylist,
  onProceedToSelected,
}) => {
  // Method A State
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.id || ''
  );
  const [accountPlaylists, setAccountPlaylists] = useState<Playlist[]>([]);
  const [fetchingAccount, setFetchingAccount] = useState(false);
  const [accountFetchError, setAccountFetchError] = useState<string | null>(null);

  // Method B State
  const [playlistUrlInput, setPlaylistUrlInput] = useState('');
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [urlFetchError, setUrlFetchError] = useState<string | null>(null);
  const [urlImportedPlaylist, setUrlImportedPlaylist] = useState<Playlist | null>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'account' | 'url'>('account');

  // Keep selectedAccountId synced with available accounts
  React.useEffect(() => {
    if ((!selectedAccountId || !accounts.some((a) => a.id === selectedAccountId)) && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  const isLimitReached = selectedPlaylists.length >= 7;

  // ── Handle Account Playlists Fetch ──
  const handleFetchAccountPlaylists = async () => {
    if (!selectedAccountId) return;
    setFetchingAccount(true);
    setAccountFetchError(null);
    try {
      const playlists = await getAccountPlaylists(selectedAccountId);
      const acc = accounts.find((a) => a.id === selectedAccountId);
      const enriched = playlists.map((p) => ({
        ...p,
        sourceAccountId: selectedAccountId,
        sourceAccountEmail: acc?.email || '',
        sourceType: 'account' as const,
      }));
      setAccountPlaylists(enriched);
      if (enriched.length === 0) {
        setAccountFetchError('No playlists found on this YouTube account.');
      }
    } catch (err: any) {
      console.error('Fetch account playlists error:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to fetch playlists.';
      setAccountFetchError(msg);
    } finally {
      setFetchingAccount(false);
    }
  };

  // ── Handle URL Import Fetch ──
  const handleFetchByUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!playlistUrlInput.trim()) return;

    setFetchingUrl(true);
    setUrlFetchError(null);
    setUrlImportedPlaylist(null);

    try {
      // Pass the first connected account if available to resolve private/unlisted playlists
      const fallbackAccount = accounts[0]?.id;
      const playlist = await getPlaylistByUrl(playlistUrlInput.trim(), fallbackAccount);
      setUrlImportedPlaylist(playlist);
    } catch (err: any) {
      console.error('Fetch playlist by URL error:', err);
      const msg =
        err.response?.data?.error ||
        'Could not access playlist. Please ensure the link is valid and that the playlist is public or unlisted. If private, connect the owner account in "Connect Accounts".';
      setUrlFetchError(msg);
    } finally {
      setFetchingUrl(false);
    }
  };

  const handleAddUrlPlaylist = () => {
    if (!urlImportedPlaylist) return;
    if (isLimitReached) return;
    onAddPlaylist(urlImportedPlaylist);
    setPlaylistUrlInput('');
    setUrlImportedPlaylist(null);
  };

  const isSelected = (id: string) => selectedPlaylists.some((p) => p.id === id);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner / Selection Counter */}
      <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-purple-400" />
            Import Playlists
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Import playlists using your connected Google accounts or by pasting any YouTube / YouTube Music playlist URL.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-xs font-mono">
            <span className="text-slate-400">Selected Playlists:</span>
            <span
              className={`font-bold ${
                isLimitReached ? 'text-amber-400 font-bold' : 'text-purple-400'
              }`}
            >
              {selectedPlaylists.length} / 7 max
            </span>
          </div>

          {selectedPlaylists.length > 0 && (
            <button
              onClick={onProceedToSelected}
              className="inline-flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-lg shadow-purple-600/30 transition-all hover:scale-105"
            >
              <ListMusic className="w-3.5 h-3.5" />
              View Staged ({selectedPlaylists.length}) →
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('account')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'account'
              ? 'border-purple-500 text-purple-400 bg-purple-500/5 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Method A: From Connected Account
        </button>
        <button
          onClick={() => setActiveTab('url')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'url'
              ? 'border-purple-500 text-purple-400 bg-purple-500/5 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Link2 className="w-4 h-4" />
          Method B: Paste Playlist Link
        </button>
      </div>

      {/* ── METHOD A: FROM CONNECTED ACCOUNT ── */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {accounts.length === 0 ? (
            <div className="border border-slate-800 rounded-2xl p-8 text-center bg-slate-900/40">
              <Users className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-white mb-1">No Accounts Connected</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                You must connect at least one Google account to fetch your private or personal playlists. Or switch to Method B to paste a link directly.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-4">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                1. Select Google Account
              </label>

              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 flex-1"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.email})
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleFetchAccountPlaylists}
                  disabled={fetchingAccount || !selectedAccountId}
                  className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-lg shadow-purple-600/30 transition-all shrink-0"
                >
                  {fetchingAccount ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Fetching Playlists…
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Fetch Playlists
                    </>
                  )}
                </button>
              </div>

              {accountFetchError && (
                <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-2.5 rounded-xl text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{accountFetchError}</span>
                </div>
              )}
            </div>
          )}

          {/* Account Playlists Results Grid */}
          {accountPlaylists.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Available Playlists ({accountPlaylists.length})
                </h3>
                {isLimitReached && (
                  <span className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full">
                    Maximum 7 playlists reached for this combine session
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {accountPlaylists.map((pl) => (
                  <PlaylistCard
                    key={pl.id}
                    playlist={pl}
                    isSelected={isSelected(pl.id)}
                    onSelect={onAddPlaylist}
                    onDeselect={onRemovePlaylist}
                    disabled={isLimitReached && !isSelected(pl.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── METHOD B: IMPORT VIA URL ── */}
      {activeTab === 'url' && (
        <div className="space-y-6">
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
                Paste YouTube / YouTube Music Playlist Link
              </label>
              <form onSubmit={handleFetchByUrl} className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={playlistUrlInput}
                    onChange={(e) => setPlaylistUrlInput(e.target.value)}
                    placeholder="https://music.youtube.com/playlist?list=PL... or https://youtube.com/playlist?list=..."
                    className="w-full bg-slate-950 border border-slate-800 pl-11 pr-4 py-3 text-sm text-white rounded-xl placeholder:text-slate-600 focus:outline-none focus:border-purple-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={fetchingUrl || !playlistUrlInput.trim()}
                  className="inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-lg shadow-purple-600/30 transition-all shrink-0"
                >
                  {fetchingUrl ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading Details…
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Import Playlist
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Explanatory note */}
            <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              <HelpCircle className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p>
                  <strong>Supported URL formats:</strong> Works with both YouTube Music links (<code className="text-slate-300">music.youtube.com/playlist?list=...</code>) and regular YouTube links (<code className="text-slate-300">youtube.com/playlist?list=...</code>).
                </p>
                <p>
                  Public and unlisted playlists work out of the box. If a playlist is private, connect the account that owns it in the <em>Connect Accounts</em> tab so Antigravity can authenticate.
                </p>
              </div>
            </div>

            {urlFetchError && (
              <div className="flex items-center gap-2 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-3 rounded-xl text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{urlFetchError}</span>
              </div>
            )}
          </div>

          {/* URL Imported Playlist Preview */}
          {urlImportedPlaylist && (
            <div className="bg-slate-900/60 border border-purple-500/40 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-xl shadow-purple-900/10">
              <div className="w-40 aspect-video rounded-xl overflow-hidden bg-slate-950 shrink-0 border border-slate-800">
                <img
                  src={urlImportedPlaylist.thumbnail}
                  alt={urlImportedPlaylist.title}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 text-center md:text-left">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                  Ready to Add
                </span>
                <h4 className="text-base font-bold text-white mt-1.5">{urlImportedPlaylist.title}</h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  By {urlImportedPlaylist.channelTitle} • {urlImportedPlaylist.itemCount} tracks
                </p>
              </div>

              <div className="shrink-0">
                {isSelected(urlImportedPlaylist.id) ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 rounded-xl font-semibold">
                    <CheckCircle className="w-4 h-4" />
                    Already in Collection
                  </span>
                ) : (
                  <button
                    onClick={handleAddUrlPlaylist}
                    disabled={isLimitReached}
                    className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs px-5 py-3 rounded-xl shadow-lg shadow-purple-600/30 transition-all"
                  >
                    + Add to Import Collection
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default ImportSection;
