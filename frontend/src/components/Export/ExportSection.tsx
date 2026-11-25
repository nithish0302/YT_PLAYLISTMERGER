import React, { useState } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ExternalLink,
  Music2,
  Loader2,
  RotateCcw,
  User,
} from 'lucide-react';
import type { Account, Track, CreatePlaylistResult } from '../../types';
import { createPlaylist, getAuthUrl, connectAccount } from '../../api';

interface ExportSectionProps {
  accounts: Account[];
  tracks: Track[];
  playlistName: string;
  playlistDescription: string;
  onAccountsUpdated: () => Promise<void>;
  onStartOver: () => void;
}

export const ExportSection: React.FC<ExportSectionProps> = ({
  accounts,
  tracks,
  playlistName,
  playlistDescription,
  onAccountsUpdated,
  onStartOver,
}) => {
  const [selectedDestinationAccountId, setSelectedDestinationAccountId] = useState<string>(
    accounts[0]?.id || ''
  );

  // Keep selectedDestinationAccountId synced with available accounts
  React.useEffect(() => {
    if ((!selectedDestinationAccountId || !accounts.some((a) => a.id === selectedDestinationAccountId)) && accounts.length > 0) {
      setSelectedDestinationAccountId(accounts[0].id);
    }
  }, [accounts, selectedDestinationAccountId]);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState('');
  const [exportResult, setExportResult] = useState<CreatePlaylistResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [connectingNewAccount, setConnectingNewAccount] = useState(false);

  const activeTracks = tracks.filter((t) => !t.isRemoved);
  const videoIdsToExport = activeTracks.map((t) => t.videoId).filter(Boolean);

  // Add new Google account from within Export section
  const handleAddNewAccount = async () => {
    setConnectingNewAccount(true);
    try {
      const url = await getAuthUrl();
      const popup = window.open(url, 'Connect Google Account', 'width=500,height=650');
      const messageListener = async (event: MessageEvent) => {
        if (event.data?.type === 'OAUTH_SUCCESS') {
          window.removeEventListener('message', messageListener);
          await onAccountsUpdated();
          setConnectingNewAccount(false);
        }
      };
      window.addEventListener('message', messageListener);
      const timer = setInterval(() => {
        if (popup?.closed) {
          clearInterval(timer);
          window.removeEventListener('message', messageListener);
          setConnectingNewAccount(false);
          onAccountsUpdated();
        }
      }, 1000);
    } catch {
      connectAccount();
    }
  };

  // Create playlist
  const handleCreatePlaylist = async () => {
    if (!selectedDestinationAccountId) {
      setExportError('Please select a destination Google account.');
      return;
    }
    if (videoIdsToExport.length === 0) {
      setExportError('There are no active songs to export.');
      return;
    }

    setIsExporting(true);
    setExportError(null);
    setExportResult(null);
    setExportProgress(10);
    setExportMessage(`Creating playlist "${playlistName}" on YouTube Music...`);

    try {
      setExportProgress(35);
      setExportMessage(`Inserting ${videoIdsToExport.length} songs into YouTube Music...`);

      const result = await createPlaylist(
        selectedDestinationAccountId,
        playlistName,
        playlistDescription,
        videoIdsToExport
      );

      setExportProgress(100);
      setExportResult(result);
    } catch (err: any) {
      console.error('Playlist creation failed:', err);
      const msg =
        err.response?.data?.error ||
        err.message ||
        'Failed to create playlist. Check that your destination account is still authenticated and quota is available.';
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-purple-400" />
            Export / Create Playlist
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Choose which Google account will own the final playlist and publish directly to YouTube Music.
          </p>
        </div>

        <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-xs font-mono">
          <span className="text-slate-400">Tracks to Export: </span>
          <span className="text-emerald-400 font-bold">{videoIdsToExport.length}</span>
        </div>
      </div>

      {/* Success State */}
      {exportResult && (
        <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-purple-950/40 border border-emerald-500/40 rounded-3xl p-8 space-y-6 shadow-2xl animate-scaleUp">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                Success
              </span>
              <h3 className="text-xl font-bold text-white mt-1">Playlist Created Successfully!</h3>
              <p className="text-xs text-slate-300">
                Added {exportResult.added} of {exportResult.total} tracks to your new YouTube Music playlist.
              </p>
            </div>
          </div>

          {/* Links & Open button */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="min-w-0 text-center sm:text-left">
              <p className="text-xs text-slate-400">YouTube Music URL:</p>
              <a
                href={exportResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-purple-400 hover:text-purple-300 hover:underline truncate block"
              >
                {exportResult.url}
              </a>
            </div>

            <div className="flex gap-2 shrink-0">
              <a
                href={exportResult.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 text-white font-semibold text-xs px-5 py-3 rounded-xl shadow-lg shadow-purple-600/30 transition-all hover:scale-105"
              >
                <span>Open in YouTube Music</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              {exportResult.youtubeUrl && (
                <a
                  href={exportResult.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-4 py-3 rounded-xl border border-slate-700 transition-colors"
                >
                  <span>Standard YouTube</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              )}
            </div>
          </div>

          {/* Failed tracks notification if any */}
          {exportResult.failed > 0 && exportResult.failedTracks && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs space-y-2">
              <h4 className="font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                {exportResult.failed} tracks could not be added
              </h4>
              <p className="text-slate-400">
                These videos may be region-restricted, marked as private, or restricted by the copyright owner:
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1 font-mono text-[11px] text-slate-400">
                {exportResult.failedTracks.map((ft, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span>Video ID: {ft.videoId}</span>
                    <span className="text-amber-400">{ft.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 flex justify-end">
            <button
              onClick={onStartOver}
              className="inline-flex items-center gap-2 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-5 py-2.5 rounded-xl border border-slate-700 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Create Another Playlist
            </button>
          </div>
        </div>
      )}

      {/* Main Export Configuration (hidden if success) */}
      {!exportResult && (
        <div className="space-y-6">
          {/* Destination Google Account Selector */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  1. Choose Destination Google Account
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  The final playlist will be created inside this account's YouTube library.
                </p>
              </div>

              <button
                onClick={handleAddNewAccount}
                disabled={connectingNewAccount}
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-purple-400 hover:text-purple-300 px-3.5 py-2 rounded-xl border border-slate-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {connectingNewAccount ? 'Connecting…' : '+ ADD NEW GOOGLE ACCOUNT'}
              </button>
            </div>

            {accounts.length === 0 ? (
              <div className="border border-slate-800 rounded-2xl p-6 text-center text-xs text-slate-400">
                No accounts connected. Please click "+ ADD NEW GOOGLE ACCOUNT" above.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                {accounts.map((acc) => {
                  const isSelected = selectedDestinationAccountId === acc.id;
                  return (
                    <div
                      key={acc.id}
                      onClick={() => setSelectedDestinationAccountId(acc.id)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center gap-3 ${
                        isSelected
                          ? 'bg-purple-950/20 border-purple-500 ring-1 ring-purple-500/50 shadow-lg shadow-purple-950/20'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="destination_account"
                        checked={isSelected}
                        onChange={() => setSelectedDestinationAccountId(acc.id)}
                        className="w-4 h-4 text-purple-600 focus:ring-0 cursor-pointer"
                      />
                      <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                        {acc.picture ? (
                          <img
                            src={acc.picture}
                            alt={acc.name}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <User className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white truncate">{acc.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{acc.email}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Playlist Summary Preview Card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row items-center gap-6">
            <div className="w-44 aspect-video rounded-2xl overflow-hidden bg-slate-950 shrink-0 border border-slate-800 relative shadow-inner">
              {activeTracks[0]?.thumbnail ? (
                <img
                  src={activeTracks[0].thumbnail}
                  alt={playlistName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-700">
                  <Music2 className="w-10 h-10" />
                </div>
              )}
              <span className="absolute bottom-2 right-2 bg-slate-950/80 backdrop-blur text-white font-mono text-[10px] px-2 py-0.5 rounded-md border border-slate-700/60">
                {videoIdsToExport.length} songs
              </span>
            </div>

            <div className="flex-1 space-y-1.5 text-center md:text-left">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20">
                Ready to Publish
              </span>
              <h3 className="text-lg font-bold text-white">{playlistName}</h3>
              <p className="text-xs text-slate-400 line-clamp-2">
                {playlistDescription || 'Centralized playlist created with Playlist Centralizer'}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
                <span>Visibility: <strong>Private (default)</strong></span>
                <span>•</span>
                <span>API: <strong>YouTube Data API v3</strong></span>
              </div>
            </div>
          </div>

          {/* Error Banner */}
          {exportError && (
            <div className="flex items-center gap-2 text-rose-300 bg-rose-500/10 border border-rose-500/30 p-4 rounded-2xl text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{exportError}</span>
            </div>
          )}

          {/* Progress Indicator */}
          {isExporting && (
            <div className="bg-slate-900 border border-purple-500/40 rounded-2xl p-6 space-y-3 shadow-xl shadow-purple-950/30">
              <div className="flex justify-between items-center text-xs">
                <span className="text-white font-semibold flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  {exportMessage}
                </span>
                <span className="font-mono text-purple-400 font-bold">{exportProgress}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
                  style={{ width: `${exportProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Prominent CREATE PLAYLIST IN YOUTUBE MUSIC Button */}
          <div className="pt-2">
            <button
              onClick={handleCreatePlaylist}
              disabled={isExporting || !selectedDestinationAccountId || videoIdsToExport.length === 0}
              className="w-full inline-flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:via-indigo-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-base py-4 rounded-2xl shadow-xl shadow-purple-600/30 transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>CREATING PLAYLIST IN YOUTUBE MUSIC…</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-5 h-5" />
                  <span>CREATE PLAYLIST IN YOUTUBE MUSIC</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
export default ExportSection;
