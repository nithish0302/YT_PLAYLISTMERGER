import React from 'react';
import {
  ListMusic,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Clock,
  FileText,
  AlertCircle,
  XCircle,
  HelpCircle,
  Sparkles,
  UserCheck,
} from 'lucide-react';

export const DashboardOverview = ({ stats = {}, loading = false }) => {
  const {
    totalTracks = 0,
    authorizedAvailable = 0,
    completedDownloads = 0,
    partialDownloads = 0,
    downloading = 0,
    waitingInQueue = 0,
    lyricsVerified = 0,
    lyricsUserConfirmed = 0,
    lyricsRequiringReview = 0,
    unavailableTracks = 0,
    failedDownloads = 0,
    snapshotVersion = 'Standard',
  } = stats;

  const cards = [
    {
      id: 'total',
      label: 'Total Tracks',
      value: totalTracks,
      description: `Snapshot (${snapshotVersion})`,
      icon: ListMusic,
      color: 'text-white',
      border: 'border-slate-800',
      bg: 'bg-slate-900/80',
    },
    {
      id: 'authorized',
      label: 'Authorized Available',
      value: authorizedAvailable,
      description: 'Jamendo, IA, ccMixter verified',
      icon: ShieldCheck,
      color: 'text-purple-400',
      border: 'border-purple-500/30',
      bg: 'bg-purple-950/15',
    },
    {
      id: 'completed',
      label: 'Completed (Full)',
      value: completedDownloads,
      description: 'Audio & verified lyrics on disk',
      icon: CheckCircle2,
      color: 'text-emerald-400',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-950/15',
    },
    {
      id: 'partial',
      label: 'Partial (Audio Only)',
      value: partialDownloads,
      description: 'Audio saved, no lyrics',
      icon: Clock,
      color: 'text-blue-400',
      border: 'border-blue-500/30',
      bg: 'bg-blue-950/15',
    },
    {
      id: 'downloading',
      label: 'Downloading',
      value: downloading,
      description: 'Streaming in parallel',
      icon: Loader2,
      color: 'text-indigo-400',
      border: 'border-indigo-500/30',
      bg: 'bg-indigo-950/15',
      animateIcon: downloading > 0,
    },
    {
      id: 'waiting',
      label: 'Waiting in Queue',
      value: waitingInQueue,
      description: 'Ready for worker',
      icon: Clock,
      color: 'text-slate-300',
      border: 'border-slate-700',
      bg: 'bg-slate-900/60',
    },
    {
      id: 'lyrics_verified',
      label: 'Verified Synced Lyrics',
      value: lyricsVerified,
      description: 'Duration & sync verified (.lrc)',
      icon: FileText,
      color: 'text-emerald-400',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-950/15',
    },
    {
      id: 'lyrics_user_confirmed',
      label: 'User Confirmed Match',
      value: lyricsUserConfirmed,
      description: 'Manual match confirmed by user',
      icon: UserCheck,
      color: 'text-teal-400',
      border: 'border-teal-500/30',
      bg: 'bg-teal-950/15',
    },
    {
      id: 'lyrics_review',
      label: 'Lyrics Needing Review',
      value: lyricsRequiringReview,
      description: 'Ambiguous or duration missing',
      icon: HelpCircle,
      color: 'text-amber-400',
      border: 'border-amber-500/30',
      bg: 'bg-amber-950/15',
    },
    {
      id: 'unavailable',
      label: 'Unavailable Tracks',
      value: unavailableTracks,
      description: 'No open legal license',
      icon: AlertCircle,
      color: 'text-slate-400',
      border: 'border-slate-800',
      bg: 'bg-slate-950/60',
    },
    {
      id: 'failed',
      label: 'Failed Downloads',
      value: failedDownloads,
      description: 'Network or decoding error',
      icon: XCircle,
      color: 'text-rose-400',
      border: 'border-rose-500/30',
      bg: 'bg-rose-950/15',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          Dashboard Overview & Health Metrics
        </h3>
        <span className="text-[11px] font-mono text-slate-500">
          Live SQLite Data Consistency
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-11 gap-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className={`p-3 rounded-2xl border ${card.border} ${card.bg} backdrop-blur flex flex-col justify-between transition-all hover:border-slate-700 min-h-[96px]`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                  {card.label}
                </span>
                <Icon className={`w-3.5 h-3.5 ${card.color} shrink-0 ${card.animateIcon ? 'animate-spin' : ''}`} />
              </div>

              <div className="my-1">
                {loading ? (
                  <div className="h-7 w-12 bg-slate-800/60 rounded animate-pulse" />
                ) : (
                  <span className={`text-2xl font-bold font-mono ${card.color}`}>
                    {card.value}
                  </span>
                )}
              </div>

              <span className="text-[9px] text-slate-500 leading-tight truncate" title={card.description}>
                {card.description}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardOverview;
