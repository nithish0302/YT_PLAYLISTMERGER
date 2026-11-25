import React, { useState } from 'react';
import {
  ListMusic,
  Trash2,
  Eye,
  ArrowRight,
  Loader2,
  Sparkles,
  Music2,
  ExternalLink,
  User,
  X,
} from 'lucide-react';
import type { Playlist, Track } from '../../types';
import { getPlaylistTracks } from '../../api';

interface SelectedSectionProps {
  selectedPlaylists: Playlist[];
  onRemovePlaylist: (playlistId: string) => void;
  onCombinePlaylists: () => Promise<void>;
  combining: boolean;
  combineProgress: string;
  onProceedToImport: () => void;
}

export const SelectedSection: React.FC<SelectedSectionProps> = ({
  selectedPlaylists,
  onRemovePlaylist,
  onCombinePlaylists,
  combining,
  combineProgress,
  onProceedToImport,
}) => {
  // Modal for "View songs"
  const [inspectPlaylist, setInspectPlaylist] = useState<Playlist | null>(null);
  const [inspectTracks, setInspectTracks] = useState<Track[]>([]);
  const [loadingInspect, setLoadingInspect] = useState(false);

  const handleOpenInspect = async (playlist: Playlist) => {
    setInspectPlaylist(playlist);
    setLoadingInspect(true);
    setInspectTracks([]);
    try {
      const tracks = await getPlaylistTracks(playlist.id, playlist.sourceAccountId);
      setInspectTracks(tracks);
    } catch (err) {
      console.error('Failed to load songs for preview:', err);
    } finally {
      setLoadingInspect(false);
    }
  };

  const totalEstimatedSongs = selectedPlaylists.reduce(
    (sum, p) => sum + (p.itemCount || 0),
    0
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-purple-400" />
            Selected Playlists Collection
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Stage up to 7 playlists from any connected account or link, inspect tracks, and combine them.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-xs font-mono">
            <span className="text-slate-400">Selected Playlists: </span>
            <span className="text-purple-400 font-bold">{selectedPlaylists.length} / 7</span>
          </div>

          {selectedPlaylists.length < 7 && (
            <button
              onClick={onProceedToImport}
              className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs px-3.5 py-2 rounded-xl border border-slate-700 transition-colors"
            >
              + Add More
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {selectedPlaylists.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-3xl p-12 text-center bg-slate-900/20">
          <ListMusic className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">No Playlists Staged Yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
            Go to the Import section to select playlists from your Google accounts or paste playlist URLs. You can select up to 7 playlists to merge.
          </p>
          <button
            onClick={onProceedToImport}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs px-6 py-3 rounded-xl shadow-lg shadow-purple-600/30 transition-all hover:scale-105"
          >
            Go to Import Section →
          </button>
        </div>
      ) : (
        <>
          {/* Staged Playlists Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {selectedPlaylists.map((playlist, idx) => (
              <div
                key={playlist.id}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Thumbnail */}
                  <div className="relative aspect-video w-full bg-slate-950">
                    {playlist.thumbnail ? (
                      <img
                        src={playlist.thumbnail}
                        alt={playlist.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-950 text-slate-700">
                        <Music2 className="w-8 h-8" />
                      </div>
                    )}
                    <span className="absolute top-2.5 left-2.5 bg-slate-950/80 backdrop-blur text-purple-300 border border-purple-500/30 text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold">
                      #{idx + 1}
                    </span>
                    <span className="absolute bottom-2.5 right-2.5 bg-slate-950/80 backdrop-blur text-white text-[11px] font-mono px-2 py-0.5 rounded-lg border border-slate-700/60">
                      {playlist.itemCount ?? 0} tracks
                    </span>
                  </div>

                  {/* Info */}
                  <div className="p-4 space-y-2">
                    <h4 className="font-semibold text-white text-sm line-clamp-1" title={playlist.title}>
                      {playlist.title}
                    </h4>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      {playlist.sourceType === 'account' ? (
                        <>
                          <User className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span className="truncate">
                            {playlist.sourceAccountEmail || 'Connected Account'}
                          </span>
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          <span className="truncate">Imported from URL</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="p-4 pt-0 flex gap-2">
                  <button
                    onClick={() => handleOpenInspect(playlist)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 py-2 rounded-xl transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    View Songs
                  </button>
                  <button
                    onClick={() => onRemovePlaylist(playlist.id)}
                    className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 py-2 px-3 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Merge Callout & COMBINE PLAYLISTS Button */}
          <div className="bg-gradient-to-r from-purple-950/40 via-indigo-950/40 to-slate-900 border border-purple-500/30 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl shadow-purple-950/30">
            <div className="space-y-1 text-center md:text-left">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-400 uppercase tracking-wider bg-purple-500/10 border border-purple-500/20 px-2.5 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3" />
                Step 3 of 6
              </span>
              <h3 className="text-xl font-bold text-white">Ready to Combine {selectedPlaylists.length} Playlists</h3>
              <p className="text-xs text-slate-400 max-w-lg">
                Fetches all tracks across your selected playlists, preserves original order and metadata, and prepares them for duplicate analysis.
              </p>
              <div className="text-xs font-mono text-slate-400 pt-1">
                Estimated tracks: <span className="text-emerald-400 font-semibold">{totalEstimatedSongs}</span>
              </div>
            </div>

            <div className="shrink-0 w-full md:w-auto text-center">
              <button
                onClick={onCombinePlaylists}
                disabled={combining}
                className="w-full md:w-auto inline-flex items-center justify-center gap-3 bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 hover:from-purple-500 hover:via-indigo-500 hover:to-pink-500 disabled:opacity-50 text-white font-bold text-base px-8 py-4 rounded-2xl shadow-xl shadow-purple-600/40 transition-all hover:scale-105 active:scale-95"
              >
                {combining ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{combineProgress || 'Combining Tracks…'}</span>
                  </>
                ) : (
                  <>
                    <span>COMBINE PLAYLISTS</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Inspect Playlist Tracks Modal */}
      {inspectPlaylist && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base truncate max-w-md">
                  {inspectPlaylist.title}
                </h3>
                <p className="text-xs text-slate-400">
                  {inspectTracks.length > 0 ? `${inspectTracks.length} tracks loaded` : 'Loading tracks...'}
                </p>
              </div>
              <button
                onClick={() => setInspectPlaylist(null)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-2">
              {loadingInspect ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
                  <span className="text-xs">Fetching tracks via YouTube API...</span>
                </div>
              ) : inspectTracks.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No tracks found in this playlist or playlist is inaccessible.
                </div>
              ) : (
                inspectTracks.map((track, i) => (
                  <div
                    key={`${track.videoId}_${i}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/80 hover:border-slate-700"
                  >
                    <span className="w-6 text-center text-xs font-mono text-slate-500">
                      {i + 1}
                    </span>
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-10 h-10 rounded-lg object-cover bg-slate-800 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white truncate">{track.title}</p>
                      <p className="text-[11px] text-slate-400 truncate">{track.artist}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectPlaylist(null)}
                className="text-xs font-semibold px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SelectedSection;
