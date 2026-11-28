import React from 'react';
import {
  Search,
  Filter,
  Music,
  FileText,
  Loader2,
  Check,
  RotateCcw,
  StopCircle,
  HelpCircle,
  CheckCircle2,
  ShieldCheck,
  Download,
  AlertTriangle,
  Info,
  ExternalLink,
} from 'lucide-react';

export const TrackTable = ({
  tracks = [],
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  lyricsFilter,
  onLyricsFilterChange,
  onDownloadTrack,
  onRetryTrack,
  onCancelTrack,
  onOpenRightsReview,
  onOpenLyricsModal,
}) => {
  // Provider badge helper
  const getProviderBadge = (provider) => {
    if (!provider) return null;
    const p = provider.toLowerCase();
    if (p.includes('jamendo')) {
      return { label: 'Jamendo', color: 'bg-purple-500/10 text-purple-300 border-purple-500/30' };
    }
    if (p.includes('archive')) {
      return { label: 'Internet Archive', color: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' };
    }
    if (p.includes('ccmixter')) {
      return { label: 'ccMixter', color: 'bg-amber-500/10 text-amber-300 border-amber-500/30' };
    }
    return { label: provider, color: 'bg-slate-800 text-slate-300 border-slate-700' };
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-4 rounded-2xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search Box */}
          <div className="relative min-w-[240px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter by title or artist..."
              className="w-full bg-slate-950 border border-slate-800 pl-10 pr-8 py-2.5 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL" className="bg-slate-900 text-white">All Statuses</option>
              <option value="DOWNLOADED" className="bg-slate-900 text-white">Downloaded (Completed / Partial)</option>
              <option value="DOWNLOADING" className="bg-slate-900 text-white">Downloading</option>
              <option value="QUEUED" className="bg-slate-900 text-white">Queued / Ready</option>
              <option value="FAILED" className="bg-slate-900 text-white">Failed</option>
              <option value="UNAVAILABLE" className="bg-slate-900 text-white">Unavailable</option>
              <option value="NEEDS_REVIEW" className="bg-slate-900 text-white">Needs Review</option>
            </select>
          </div>

          {/* Lyrics Filter */}
          <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-2 rounded-xl">
            <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <select
              value={lyricsFilter}
              onChange={(e) => onLyricsFilterChange(e.target.value)}
              className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer pr-1"
            >
              <option value="ALL" className="bg-slate-900 text-white">All Lyrics</option>
              <option value="SYNCHRONIZED" className="bg-slate-900 text-white">Verified Synced (.lrc)</option>
              <option value="USER_CONFIRMED" className="bg-slate-900 text-white">User Confirmed Match</option>
              <option value="NEEDS_REVIEW" className="bg-slate-900 text-white">Lyrics Needing Review</option>
              <option value="PLAIN" className="bg-slate-900 text-white">Plain Text (.txt)</option>
              <option value="UNAVAILABLE" className="bg-slate-900 text-white">Unavailable</option>
            </select>
          </div>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          Showing <strong className="text-white">{tracks.length}</strong> matching tracks
        </span>
      </div>

      {/* Tracks Container */}
      {tracks.length === 0 ? (
        <div className="border border-slate-800 rounded-3xl p-16 text-center text-slate-500 text-xs bg-slate-900/30 space-y-2">
          <Info className="w-6 h-6 mx-auto text-slate-600" />
          <p className="font-semibold text-slate-400">No tracks match your current filter or search criteria.</p>
          <p className="text-[11px] text-slate-500">Try switching your status filter or clearing search keywords.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tracks.map((track) => {
            const isDownloading = track.download_status === 'DOWNLOADING';
            const isCompleted = track.download_status === 'COMPLETED';
            const isPartial = track.download_status === 'PARTIAL';
            const isNeedsReview = track.download_status === 'NEEDS_REVIEW';
            const isUnavailable = track.download_status === 'UNAVAILABLE';
            const isFailed = track.download_status === 'FAILED';
            const isCancelled = track.download_status === 'CANCELLED';
            const isReady = track.download_status === 'READY';

            const providerBadge = getProviderBadge(track.audio_provider);

            // STRICT: Audio is authorized ONLY when provider is set, rights_status is AUTHORIZED or valid licensed source exists
            const isAudioAuthorized = Boolean(track.source_url && track.audio_provider && track.rights_status !== 'REJECTED' && track.download_status !== 'UNAVAILABLE');

            return (
              <div
                key={track.id}
                className={`p-4 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  isCompleted
                    ? 'bg-slate-900/90 border-emerald-500/30 shadow-sm'
                    : isPartial
                    ? 'bg-slate-900/90 border-blue-500/30'
                    : isNeedsReview
                    ? 'bg-amber-950/15 border-amber-500/40'
                    : isUnavailable
                    ? 'bg-slate-950/40 border-slate-800/80 opacity-75'
                    : isFailed
                    ? 'bg-rose-950/15 border-rose-500/40'
                    : isDownloading
                    ? 'bg-purple-950/20 border-purple-500/40'
                    : 'bg-slate-900/70 border-slate-800'
                }`}
              >
                {/* Left: Position, Thumbnail & Track Info */}
                <div className="flex items-center gap-3.5 min-w-0 flex-1">
                  {/* Position number */}
                  <span className="w-8 text-center text-xs font-mono font-bold text-slate-500 shrink-0">
                    #{track.playlist_position + 1}
                  </span>

                  {/* Thumbnail */}
                  <div className="w-12 h-12 rounded-xl bg-slate-950 overflow-hidden shrink-0 border border-slate-800 flex items-center justify-center">
                    {track.thumbnail ? (
                      <img
                        src={track.thumbnail}
                        alt={track.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Music className="w-4 h-4 text-slate-600" />
                    )}
                  </div>

                  {/* Title & Metadata */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-semibold text-white truncate max-w-md" title={track.title}>
                        {track.title}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">
                      {track.artist}
                    </p>

                    {/* Metadata Badges Row */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[10px]">
                      {/* Audio Provider & Format */}
                      {providerBadge ? (
                        <span className={`font-semibold px-2 py-0.5 rounded-md border ${providerBadge.color}`}>
                          {providerBadge.label} {track.audio_format ? `(${track.audio_format.toUpperCase()})` : ''}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-500">
                          No Provider
                        </span>
                      )}

                      {/* Actual Verified Bitrate */}
                      {track.actual_bitrate ? (
                        <span className="font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          {Math.round(track.actual_bitrate / 1000)} kbps
                          {track.sample_rate ? ` • ${(track.sample_rate / 1000).toFixed(1)}kHz` : ''}
                        </span>
                      ) : null}

                      {/* Source License */}
                      {track.source_license && (
                        <span className="text-slate-400 bg-slate-950 border border-slate-800 px-2 py-0.5 rounded-md truncate max-w-[140px]" title={track.source_license}>
                          {track.source_license}
                        </span>
                      )}

                      {/* Lyrics Status Pill */}
                      {track.lyrics_status === 'VERIFIED_SYNCHRONIZED' || track.lyrics_status === 'SYNCHRONIZED' ? (
                        <button
                          onClick={() => onOpenLyricsModal(track)}
                          className="inline-flex items-center gap-1 font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md hover:bg-emerald-500/25 transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Synced .lrc</span>
                        </button>
                      ) : track.lyrics_status === 'USER_CONFIRMED_MATCH' ? (
                        <button
                          onClick={() => onOpenLyricsModal(track)}
                          className="inline-flex items-center gap-1 font-semibold text-teal-300 bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 rounded-md hover:bg-teal-500/25 transition-colors"
                        >
                          <Check className="w-3 h-3 text-teal-400" />
                          <span>User Confirmed</span>
                        </button>
                      ) : track.lyrics_status === 'SYNCHRONIZED_NEEDS_REVIEW' || track.needs_confirmation ? (
                        <button
                          onClick={() => onOpenLyricsModal(track)}
                          className="inline-flex items-center gap-1 font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md hover:bg-amber-500/25 transition-colors"
                        >
                          <HelpCircle className="w-3 h-3 text-amber-400" />
                          <span>Review Lyrics</span>
                        </button>
                      ) : track.lyrics_status === 'PLAIN' ? (
                        <button
                          onClick={() => onOpenLyricsModal(track)}
                          className="inline-flex items-center gap-1 font-semibold text-blue-300 bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 rounded-md hover:bg-blue-500/25 transition-colors"
                        >
                          <FileText className="w-3 h-3 text-blue-400" />
                          <span>Plain Lyrics</span>
                        </button>
                      ) : track.lyrics_status === 'INSTRUMENTAL' ? (
                        <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                          Instrumental
                        </span>
                      ) : (
                        <span className="text-slate-500">Lyrics unavailable</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Middle: Progress / Status */}
                <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-1.5 shrink-0 min-w-[130px]">
                  {isDownloading ? (
                    <div className="w-full space-y-1 text-right">
                      <span className="text-[11px] font-mono text-purple-300 font-bold flex items-center justify-end gap-1">
                        <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                        {track.download_progress >= 0 ? `${track.download_progress}%` : 'Streaming…'}
                      </span>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all duration-200"
                          style={{ width: `${Math.max(5, track.download_progress || 0)}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className={`text-[10px] font-bold font-mono px-2.5 py-1 rounded-lg uppercase ${
                      isCompleted
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : isPartial
                        ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                        : isNeedsReview
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : isUnavailable
                        ? 'bg-slate-800 text-slate-400 border border-slate-700'
                        : isFailed
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        : isCancelled
                        ? 'bg-slate-800 text-slate-400'
                        : 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                    }`}>
                      {track.download_status}
                    </span>
                  )}

                  {track.error_message && (
                    <p className="text-[10px] text-rose-400 max-w-[180px] truncate" title={track.error_message}>
                      {track.error_message}
                    </p>
                  )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* View Details / Rights Review button */}
                  <button
                    onClick={() => onOpenRightsReview(track)}
                    className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors"
                  >
                    Details
                  </button>

                  {/* Downloading -> Cancel */}
                  {isDownloading ? (
                    <button
                      onClick={() => onCancelTrack(track.id)}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl border border-rose-500/30 transition-colors"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  ) : isFailed || isCancelled ? (
                    <button
                      onClick={() => onRetryTrack(track.id)}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-xl border border-rose-500/30 transition-colors font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                  ) : isCompleted || isPartial ? (
                    <span className="text-emerald-400 text-xs flex items-center gap-1 font-semibold px-2 py-1">
                      <Check className="w-3.5 h-3.5" />
                      <span>Saved</span>
                    </span>
                  ) : isNeedsReview ? (
                    <button
                      onClick={() => onOpenRightsReview(track)}
                      className="text-xs px-3.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-colors font-semibold shadow-md shadow-amber-600/20"
                    >
                      Review
                    </button>
                  ) : isAudioAuthorized ? (
                    /* STRICT: Download button is rendered ONLY when audio is authorized and NOT rejected */
                    <button
                      onClick={() => onDownloadTrack(track.id)}
                      className="inline-flex items-center gap-1 text-xs px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition-all font-semibold shadow-md shadow-purple-600/25"
                    >
                      <Download className="w-3 h-3" />
                      <span>Download</span>
                    </button>
                  ) : (
                    /* When unauthorized or unavailable, Download button is strictly NOT shown */
                    <span className="text-slate-500 text-xs px-2 py-1 font-medium italic">
                      Unavailable
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrackTable;
