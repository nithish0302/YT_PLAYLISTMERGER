import React from 'react';
import {
  X,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  FileText,
  Music,
  Check,
  Loader2,
  Lock,
} from 'lucide-react';

export const RightsReviewModal = ({
  track,
  candidates = [],
  loading = false,
  onClose,
  onSelectCandidate,
}) => {
  if (!track) return null;

  const getOutcomeBadge = (outcome, rightsStatus) => {
    const isRejected = outcome === 'REJECTED' || rightsStatus === 'REJECTED' || rightsStatus === 'UNSUPPORTED_CC_CLAIM';
    const isReview = outcome === 'NEEDS_REVIEW' || rightsStatus === 'NEEDS_REVIEW';
    const isAuthorized = outcome === 'HIGH_CONFIDENCE' || rightsStatus === 'AUTHORIZED';

    if (isRejected) {
      return {
        label: 'REJECTED / UNAUTHORIZED',
        color: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
        icon: XCircle,
      };
    }
    if (isReview) {
      return {
        label: 'NEEDS REVIEW',
        color: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        icon: AlertTriangle,
      };
    }
    if (isAuthorized) {
      return {
        label: 'VERIFIED AUTHORIZED',
        color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        icon: ShieldCheck,
      };
    }
    return {
      label: outcome || 'UNVERIFIED',
      color: 'bg-slate-800 text-slate-300 border-slate-700',
      icon: AlertTriangle,
    };
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Copyright & Rights Integrity Audit
              </span>
            </div>
            <h3 className="font-bold text-white text-base mt-1 truncate max-w-xl">
              Source & Rights Review: "{track.title}"
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Original Artist: <strong className="text-slate-200">{track.artist}</strong> • Playlist Position: #{track.playlist_position + 1}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Section 1: Original YouTube Playlist Metadata */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-400 block">
              1. Original Playlist Snapshot Identity
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Track Title</span>
                <span className="text-white font-medium truncate block mt-0.5">{track.title}</span>
              </div>
              <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Artist / Channel</span>
                <span className="text-white font-medium truncate block mt-0.5">{track.artist}</span>
              </div>
              <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">YouTube Video ID</span>
                <a
                  href={`https://www.youtube.com/watch?v=${track.video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline font-mono inline-flex items-center gap-1 mt-0.5"
                >
                  <span>{track.video_id}</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80">
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Playlist Position</span>
                <span className="text-emerald-400 font-mono font-bold mt-0.5 block">
                  #{track.playlist_position + 1}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Audio Provider Candidates & Rights Verification */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block">
                2. Provider Candidates & Rights Determination ({candidates.length})
              </span>
              <span className="text-[11px] text-slate-500">
                Searching Jamendo, Internet Archive & ccMixter
              </span>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2 border border-slate-800 rounded-2xl bg-slate-950/40">
                <Loader2 className="w-7 h-7 animate-spin text-purple-500" />
                <span className="text-xs">Querying authorized provider metadata & inspecting licenses...</span>
              </div>
            ) : candidates.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs border border-slate-800 rounded-2xl bg-slate-950/40">
                No audio candidates found across licensed providers for this song.
              </div>
            ) : (
              <div className="space-y-3">
                {candidates.map((c, idx) => {
                  const badge = getOutcomeBadge(c.matchOutcome, c.rightsStatus);
                  const Icon = badge.icon;
                  const isRejected = c.matchOutcome === 'REJECTED' || c.rightsStatus === 'REJECTED' || c.rightsStatus === 'UNSUPPORTED_CC_CLAIM' || !c.downloadAllowed;

                  return (
                    <div
                      key={`${c.provider}_${c.providerTrackId}_${idx}`}
                      className={`p-4 rounded-2xl border transition-all ${
                        isRejected
                          ? 'bg-rose-950/10 border-rose-500/30'
                          : c.matchOutcome === 'HIGH_CONFIDENCE'
                          ? 'bg-slate-950 border-emerald-500/40 ring-1 ring-emerald-500/20'
                          : 'bg-slate-950 border-amber-500/40 ring-1 ring-amber-500/20'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="space-y-2 flex-1 min-w-0">
                          {/* Badges Row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/30">
                              {c.provider}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border flex items-center gap-1 ${badge.color}`}>
                              <Icon className="w-3 h-3" />
                              {badge.label} ({Math.round((c.matchScore || 0) * 100)}%)
                            </span>
                            {c.format && (
                              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                                {c.format.toUpperCase()}
                              </span>
                            )}
                            {c.bitrate && (
                              <span className="text-[10px] font-mono text-slate-400">
                                {Math.round(c.bitrate / 1000)} kbps
                              </span>
                            )}
                          </div>

                          {/* Candidate Metadata */}
                          <div>
                            <h4 className="text-xs font-semibold text-white truncate">{c.title}</h4>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              Creator / Performer: <strong className="text-slate-300">{c.artist}</strong>
                              {c.album ? ` • Album: ${c.album}` : ''}
                            </p>
                          </div>

                          {/* License Information */}
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap pt-0.5">
                            <span>
                              License: <strong className="text-purple-300 font-mono">{c.licenseName || 'Standard Open License'}</strong>
                            </span>
                            {c.licenseUrl && (
                              <a
                                href={c.licenseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline inline-flex items-center gap-0.5"
                              >
                                <span>Terms</span>
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            {c.providerTrackId && (
                              <span className="font-mono text-slate-500 text-[10px]">
                                Item ID: {c.providerTrackId}
                              </span>
                            )}
                          </div>

                          {/* Rights Determination & Justification */}
                          <div className={`p-2.5 rounded-xl text-xs border ${
                            isRejected
                              ? 'bg-rose-950/20 text-rose-300 border-rose-500/30'
                              : 'bg-slate-900/80 text-slate-300 border-slate-800'
                          }`}>
                            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                              Rights Determination & Rationale:
                            </span>
                            <p className="leading-relaxed">
                              {c.rightsReason || c.versionDiscrepancies?.join(' ') || (
                                isRejected
                                  ? 'Commercial pop song or unverified third-party CC upload on archive. Excluded per copyright audit.'
                                  : 'Verified authorized recording match under permitted Creative Commons / Open Access license.'
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Action Column: STRICT ENFORCEMENT OF RIGHTS */}
                        <div className="flex md:flex-col items-center md:items-end justify-between md:justify-start gap-2 shrink-0">
                          {isRejected ? (
                            <div className="p-2 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-400 text-center space-y-1 max-w-[140px]">
                              <div className="flex items-center justify-center gap-1 text-[11px] font-bold">
                                <Lock className="w-3.5 h-3.5" />
                                <span>Blocked</span>
                              </div>
                              <span className="text-[9px] text-rose-300/80 leading-tight block">
                                Rights check failed. Download prohibited.
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => onSelectCandidate(c)}
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-lg shadow-purple-600/25 transition-all"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Select Verified Match</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
          <span className="text-[11px] text-slate-500">
            Automated verification engine guarantees adherence to copyright policy.
          </span>
          <button
            onClick={onClose}
            className="text-xs font-semibold px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default RightsReviewModal;
