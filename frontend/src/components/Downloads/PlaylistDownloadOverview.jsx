import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  StopCircle,
  FileArchive,
  Disc3,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
} from 'lucide-react';

export const PlaylistDownloadOverview = ({
  activeJob,
  stats = {},
  onStartQueue,
  onPauseQueue,
  onResumeQueue,
  onCancelQueueClick,
  onRetryFailedClick,
  onOpenExportModal,
}) => {
  if (!activeJob) return null;

  const {
    totalTracks = activeJob.total_tracks || 0,
    completedCount = activeJob.completed_tracks || 0,
    remainingCount = Math.max(0, totalTracks - completedCount - (stats.unavailableTracks || 0)),
    failedDownloads = activeJob.failed_tracks || 0,
    unavailableTracks = activeJob.unavailable_tracks || 0,
    estimatedRemainingSeconds = null,
    snapshotVersion = 'Standard',
  } = stats;

  const isDownloading = activeJob.status === 'DOWNLOADING';
  const isPaused = activeJob.status === 'PAUSED';
  const isCompleted = activeJob.status === 'COMPLETED';
  const isCancelled = activeJob.status === 'CANCELLED';

  const progressPct = totalTracks > 0
    ? Math.min(100, Math.round((completedCount / totalTracks) * 100))
    : 0;

  const canExportZip = completedCount > 0;

  const formatRemainingTime = (secs) => {
    if (!secs || secs <= 0) return null;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  const etaString = formatRemainingTime(estimatedRemainingSeconds);

  return (
    <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl space-y-5 backdrop-blur">
      {/* Top Bar: Title, Snapshot Version, Status, Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-purple-300 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Snapshot: {snapshotVersion}
            </span>

            <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full uppercase font-bold ${
              isDownloading
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 animate-pulse'
                : isPaused
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : isCompleted
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : isCancelled
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
            }`}>
              {activeJob.status}
            </span>
          </div>

          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Disc3 className={`w-5 h-5 text-purple-400 ${isDownloading ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
            <span>{activeJob.playlist_title || 'Playlist Download Job'}</span>
          </h3>
          <p className="text-xs text-slate-400">
            Playlist ID: <span className="font-mono text-slate-300">{activeJob.playlist_id || 'Direct Import'}</span> • Maximum Concurrency: 2 workers
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {isDownloading ? (
            <button
              onClick={onPauseQueue}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-4 py-2.5 rounded-xl transition-all"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause Queue
            </button>
          ) : isPaused ? (
            <button
              onClick={onResumeQueue}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 transition-all hover:scale-105"
            >
              <Play className="w-3.5 h-3.5" />
              Resume Queue
            </button>
          ) : (
            <button
              onClick={onStartQueue}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 transition-all hover:scale-105"
            >
              <Play className="w-3.5 h-3.5" />
              Start Download Queue
            </button>
          )}

          {/* Cancel Queue button */}
          {(isDownloading || isPaused || activeJob.status === 'PENDING') && (
            <button
              onClick={onCancelQueueClick}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 px-3.5 py-2.5 rounded-xl transition-all"
              title="Cancel all pending and active downloads"
            >
              <StopCircle className="w-3.5 h-3.5 text-rose-400" />
              Cancel Queue
            </button>
          )}

          {/* Retry Failed button */}
          {failedDownloads > 0 && (
            <button
              onClick={onRetryFailedClick}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 px-3.5 py-2.5 rounded-xl transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry Failed ({failedDownloads})
            </button>
          )}

          {/* Export Verified ZIP button */}
          <button
            onClick={onOpenExportModal}
            disabled={!canExportZip}
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl border transition-all ${
              canExportZip
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-600/25 cursor-pointer'
                : 'bg-slate-800 text-slate-500 border-slate-700 opacity-50 cursor-not-allowed'
            }`}
          >
            <FileArchive className="w-4 h-4" />
            Export Verified ZIP
          </button>
        </div>
      </div>

      {/* Progress Bar & ETA */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-400 font-mono gap-1">
          <div className="flex items-center gap-3">
            <span>
              Downloaded: <strong className="text-white">{completedCount}</strong> of <strong className="text-white">{totalTracks}</strong> tracks
            </span>
            {etaString && (
              <span className="text-purple-300 font-semibold flex items-center gap-1 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                <Clock className="w-3 h-3 text-purple-400" />
                Est. Remaining: {etaString}
              </span>
            )}
          </div>
          <span className="text-emerald-400 font-bold">{progressPct}%</span>
        </div>

        <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
          <div
            className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-emerald-400 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Counters Pill Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
        <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Completed
          </span>
          <span className="text-sm font-bold font-mono text-emerald-400">{completedCount}</span>
        </div>

        <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-purple-400" />
            Remaining
          </span>
          <span className="text-sm font-bold font-mono text-purple-300">{remainingCount}</span>
        </div>

        <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Unavailable
          </span>
          <span className="text-sm font-bold font-mono text-amber-400">{unavailableTracks}</span>
        </div>

        <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center justify-between">
          <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            Failed
          </span>
          <span className="text-sm font-bold font-mono text-rose-400">{failedDownloads}</span>
        </div>
      </div>
    </div>
  );
};

export default PlaylistDownloadOverview;
