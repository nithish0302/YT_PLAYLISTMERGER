import React from 'react';
import {
  X,
  FileText,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Clock,
  Check,
  ShieldAlert,
} from 'lucide-react';

export const LyricsPreviewModal = ({
  track,
  onClose,
  onConfirmLyrics,
}) => {
  if (!track) return null;

  const isVerifiedSynced = track.lyrics_status === 'VERIFIED_SYNCHRONIZED' || track.lyrics_status === 'SYNCHRONIZED';
  const isUserConfirmed = track.lyrics_status === 'USER_CONFIRMED_MATCH';
  const isNeedsReview = track.lyrics_status === 'SYNCHRONIZED_NEEDS_REVIEW' || track.needs_confirmation;
  const isPlain = track.lyrics_status === 'PLAIN';
  const isInstrumental = track.lyrics_status === 'INSTRUMENTAL';
  const isUnavailable = !isVerifiedSynced && !isUserConfirmed && !isNeedsReview && !isPlain && !isInstrumental;

  const confidencePct = Math.round((track.match_confidence || 0) * 100);

  const rawLyrics = track.synced_lyrics || track.plain_lyrics || '';

  // Parse synchronized lines if present
  const lines = rawLyrics.split('\n');

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-purple-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
                LRCLIB Lyrics Integration
              </span>
            </div>
            <h3 className="font-bold text-white text-base mt-1 truncate max-w-md">
              Lyrics: {track.title}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Artist: <strong className="text-slate-200">{track.artist}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="px-6 pt-4">
          <div className="flex items-center justify-between p-3.5 rounded-2xl border text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {isVerifiedSynced ? (
                <>
                  <span className="p-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <CheckCircle2 className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-bold text-emerald-400 block">Verified Synchronized (.lrc)</span>
                    <span className="text-[10px] text-slate-400">Technical recording duration match confirmed ({confidencePct}%)</span>
                  </div>
                </>
              ) : isUserConfirmed ? (
                <>
                  <span className="p-1 rounded-md bg-teal-500/10 text-teal-400 border border-teal-500/30">
                    <Check className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-bold text-teal-400 block">User Confirmed Match (.lrc)</span>
                    <span className="text-[10px] text-slate-400">
                      Manually confirmed by user. Note: User confirmation does not establish technical duration synchronization.
                    </span>
                  </div>
                </>
              ) : isNeedsReview ? (
                <>
                  <span className="p-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-bold text-amber-400 block">Synchronized (Needs Review)</span>
                    <span className="text-[10px] text-slate-400">
                      Duration variance detected or missing metadata ({confidencePct}% match). Never labeled as verified without verification.
                    </span>
                  </div>
                </>
              ) : isPlain ? (
                <>
                  <span className="p-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30">
                    <FileText className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-bold text-blue-400 block">Plain Text Lyrics (.txt)</span>
                    <span className="text-[10px] text-slate-400">Unsynchronized text format</span>
                  </div>
                </>
              ) : isInstrumental ? (
                <>
                  <span className="p-1 rounded-md bg-slate-800 text-slate-300">
                    <Clock className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-bold text-slate-300 block">Instrumental</span>
                    <span className="text-[10px] text-slate-400">No vocal track present</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="p-1 rounded-md bg-slate-800 text-slate-400">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  <div>
                    <span className="font-bold text-slate-400 block">Unavailable</span>
                    <span className="text-[10px] text-slate-500">No matching lyrics found on LRCLIB</span>
                  </div>
                </>
              )}
            </div>

            {/* Confirmation actions if needs review */}
            {isNeedsReview && onConfirmLyrics && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onConfirmLyrics(track.id, true)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm Match</span>
                </button>
                <button
                  onClick={() => onConfirmLyrics(track.id, false)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-semibold text-xs transition-all"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Lyrics Content Display */}
        <div className="p-6 overflow-y-auto flex-1">
          {rawLyrics ? (
            <div className="font-mono text-xs leading-relaxed text-slate-300 bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-1">
              {lines.map((line, idx) => {
                const isTimestamp = line.startsWith('[');
                return (
                  <div key={idx} className="flex items-start gap-2">
                    {isTimestamp ? (
                      <>
                        <span className="text-purple-400 select-none font-semibold shrink-0">
                          {line.slice(0, 10)}
                        </span>
                        <span className="text-slate-200">{line.slice(10)}</span>
                      </>
                    ) : (
                      <span className="text-slate-300">{line}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center text-slate-500 text-xs italic bg-slate-950/40 rounded-2xl border border-slate-800">
              No lyrics content stored for this track.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-950/40">
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

export default LyricsPreviewModal;
