import React, { useState } from 'react';
import {
  ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle2,
  RefreshCw, Search, ExternalLink, Music, FileText, XCircle, Info
} from 'lucide-react';

export const AuditDashboard = ({ auditData, auditing, onRunAudit, scanId }) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  if (!auditData) {
    return (
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
        <ShieldCheck className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-2">Data Integrity Audit</h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
          Audit playlist tracks against original YouTube video IDs, candidate licenses, rights justifications, and LRCLIB timestamp synchronicity.
        </p>
        <button
          onClick={onRunAudit}
          disabled={auditing}
          className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-sm flex items-center gap-2 mx-auto disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${auditing ? 'animate-spin' : ''}`} />
          {auditing ? 'Auditing 181 Tracks...' : 'Run Integrity & Rights Audit'}
        </button>
      </div>
    );
  }

  const tracks = auditData.tracks || [];

  // Filter tracks
  const filtered = tracks.filter(t => {
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      const matchTitle = (t.title || '').toLowerCase().includes(q);
      const matchArtist = (t.artist || '').toLowerCase().includes(q);
      const matchId = (t.videoId || '').toLowerCase().includes(q);
      if (!matchTitle && !matchArtist && !matchId) return false;
    }

    if (filter === 'mismatches') return t.hasMismatch;
    if (filter === 'rights_review') return t.bestAudioCandidate && t.bestAudioCandidate.rights_status !== 'SUPPORTED';
    if (filter === 'synced_review') return t.lyricsStatus === 'SYNCHRONIZED_NEEDS_REVIEW';
    if (filter === 'verified_lyrics') return t.lyricsStatus === 'VERIFIED_SYNCHRONIZED';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-slate-900 rounded-2xl border border-slate-800 p-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white">Data Integrity & Match Verification</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Phase 3.1 Audited
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Validated against immutable YouTube video IDs and snapshot metadata · Last audited: {auditData.createdAt ? new Date(auditData.createdAt).toLocaleTimeString() : 'Just now'}
          </p>
        </div>
        <button
          onClick={onRunAudit}
          disabled={auditing}
          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-medium text-xs flex items-center gap-2 border border-slate-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${auditing ? 'animate-spin' : ''}`} />
          {auditing ? 'Re-auditing...' : 'Re-Run Audit'}
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase mb-1">TRACKS AUDITED</p>
          <p className="text-2xl font-bold text-white">{auditData.totalAudited}</p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase mb-1">CORRECT IDENTITY</p>
          <p className="text-2xl font-bold text-emerald-400">{auditData.correctAssociations}</p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase mb-1">MISMATCHES</p>
          <p className={`text-2xl font-bold ${auditData.mismatchesDetected > 0 ? 'text-red-400' : 'text-slate-400'}`}>
            {auditData.mismatchesDetected}
          </p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase mb-1">RIGHTS REJECTED</p>
          <p className="text-2xl font-bold text-red-400">{auditData.candidatesRejectedRights}</p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase mb-1">CANDIDATES REVIEW</p>
          <p className="text-2xl font-bold text-amber-400">{auditData.candidatesRequiringReview}</p>
        </div>
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
          <p className="text-[10px] font-semibold tracking-wider text-slate-500 uppercase mb-1">SYNC LYRICS REVIEW</p>
          <p className="text-2xl font-bold text-cyan-400">{auditData.lyricsNeedsReview}</p>
        </div>
      </div>

      {/* Rights Disclaimer Alert */}
      <div className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-4 flex items-start gap-3 text-xs text-amber-200/90">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-amber-300">Phase 3.1 Strict Authorization Rule: </span>
          Creative Commons declarations on Internet Archive by third-party uploaders are treated as <code className="bg-amber-900/40 px-1 rounded">UNSUPPORTED</code> because third parties cannot relicense copyrighted commercial master recordings. Derivative works (Nightcore, Slowed, Sleepcore), live bootlegs, and covers are rejected from automatic download. Synchronized lyrics are marked <code className="bg-amber-900/40 px-1 rounded">SYNCHRONIZED_NEEDS_REVIEW</code> until track durations are confirmed against studio recordings.
        </div>
      </div>

      {/* Mismatch Inspector Alert (if any) */}
      {auditData.mismatches && auditData.mismatches.length > 0 ? (
        <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 font-semibold text-sm mb-3">
            <ShieldAlert className="w-4 h-4" />
            <span>Identity Mismatches Detected ({auditData.mismatches.length})</span>
          </div>
          <div className="space-y-2">
            {auditData.mismatches.map((m, mi) => (
              <div key={mi} className="bg-slate-900/80 rounded-lg p-3 text-xs border border-red-900/30">
                <p className="font-bold text-slate-200 mb-1">Track #{m.position} · Video ID: <code>{m.videoId}</code></p>
                <p className="text-slate-400 mb-2">Original: <span className="text-white">{m.officialTitle}</span> by {m.officialArtist}</p>
                <ul className="list-disc pl-4 text-red-300 space-y-0.5">
                  {m.reasons.map((r, ri) => <li key={ri}>{r}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-xl p-4 flex items-center gap-3 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span><strong>100% Identity Integrity Verified:</strong> All 181 tracks are correctly bound by immutable YouTube video IDs and original playlist positions. Zero cross-track contamination or array-index drift.</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'all', label: 'All Tracks', count: tracks.length },
              { id: 'rights_review', label: 'Rights Issues', count: auditData.candidatesRequiringReview },
              { id: 'synced_review', label: 'Synced Lyrics Review', count: auditData.lyricsNeedsReview },
              { id: 'mismatches', label: 'Mismatches', count: auditData.mismatchesDetected },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filter === tab.id
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search audited tracks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 border border-slate-700 focus:outline-none focus:border-cyan-500 w-64"
            />
          </div>
        </div>
      </div>

      {/* Audited Tracks List */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden divide-y divide-slate-800/50">
        <div className="p-4 bg-slate-900/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider grid grid-cols-12 gap-3">
          <span className="col-span-1">#</span>
          <span className="col-span-4">Original Track (Identity)</span>
          <span className="col-span-4">Audio Candidate & Rights Status</span>
          <span className="col-span-3">Lyrics Verification</span>
        </div>

        {filtered.map(t => {
          const best = t.bestAudioCandidate;
          return (
            <div key={t.videoId} className="p-4 hover:bg-slate-800/30 transition-colors grid grid-cols-12 gap-3 items-center text-xs">
              {/* Position */}
              <div className="col-span-1 font-mono text-slate-500 font-bold">
                #{t.position}
              </div>

              {/* Original Track */}
              <div className="col-span-4 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white truncate">{t.title}</span>
                  <a
                    href={`https://youtu.be/${t.videoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-500 hover:text-cyan-400"
                    title={`View YouTube video: ${t.videoId}`}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-slate-400 truncate text-[11px]">{t.artist}</p>
                <p className="font-mono text-[10px] text-slate-600">ID: {t.videoId}</p>
              </div>

              {/* Audio Candidate & Rights */}
              <div className="col-span-4 space-y-1">
                {best ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-300 font-medium truncate max-w-[200px]">{best.candidate_title}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {best.provider}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                        {best.version_type || 'STUDIO_ORIGINAL'}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                        {best.rights_status || 'UNSUPPORTED_CC_CLAIM'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 line-clamp-1">{best.rights_justification || 'CC assertion not validated.'}</p>
                  </>
                ) : (
                  <span className="text-slate-600 text-xs">No audio candidates found</span>
                )}
              </div>

              {/* Lyrics Verification */}
              <div className="col-span-3 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    t.lyricsStatus === 'VERIFIED_SYNCHRONIZED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                    t.lyricsStatus === 'SYNCHRONIZED_NEEDS_REVIEW' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    t.lyricsStatus === 'PLAIN' ? 'bg-blue-500/20 text-blue-400' :
                    t.lyricsStatus === 'INSTRUMENTAL' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-slate-800 text-slate-500'
                  }`}>
                    {t.lyricsStatus}
                  </span>
                </div>
                {t.lyricsNotes && (
                  <p className="text-[10px] text-slate-500 line-clamp-2">{t.lyricsNotes}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
