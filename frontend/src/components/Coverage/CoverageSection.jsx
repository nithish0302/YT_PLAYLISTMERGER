import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Scan, BarChart3, Music, Mic2, FileText, Download, Shield,
  CheckCircle2, AlertTriangle, XCircle, Clock, RefreshCw, Search,
  ChevronDown, ChevronUp, ExternalLink, FileDown, Loader2,
  ShieldCheck, ShieldAlert,
} from 'lucide-react';
import {
  getCoverageScans, getCoverageScan, getCoverageReport,
  getCoverageExportUrl, getCoverageCsvUrl,
  createCoverageScan, cancelCoverageScan,
  getCoverageTrackDetails, confirmCoverageCandidate,
  getCoverageAudit, runCoverageAudit,
} from '../../api';
import { AuditDashboard } from './AuditDashboard';

const PROVIDER_LABELS = {
  jamendo: { name: 'Jamendo', color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  internet_archive: { name: 'Internet Archive', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  ccmixter: { name: 'ccMixter', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
};

const QUALITY_LABELS = {
  LOSSLESS: { label: 'Lossless', color: 'text-emerald-400' },
  HIGH_BITRATE_LOSSY: { label: 'High Bitrate', color: 'text-blue-400' },
  STANDARD_LOSSY: { label: 'Standard', color: 'text-yellow-400' },
  UNKNOWN: { label: 'Unknown', color: 'text-slate-400' },
};

const STATUS_ICONS = {
  AUTHORIZED: { icon: CheckCircle2, color: 'text-emerald-400', label: 'Authorized' },
  NEEDS_REVIEW: { icon: AlertTriangle, color: 'text-amber-400', label: 'Needs Review' },
  UNAVAILABLE: { icon: XCircle, color: 'text-red-400', label: 'Unavailable' },
};

export const CoverageSection = () => {
  const [scans, setScans] = useState([]);
  const [activeScan, setActiveScan] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [expandedTrack, setExpandedTrack] = useState(null);
  const [trackDetails, setTrackDetails] = useState(null);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('coverage'); // 'coverage' | 'audit'
  const [auditData, setAuditData] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [auditFilter, setAuditFilter] = useState('all'); // 'all' | 'mismatches' | 'review' | 'rejected' | 'synced_review'

  // Load scans on mount
  useEffect(() => {
    loadScans();
  }, []);

  const loadScans = async () => {
    try {
      const data = await getCoverageScans();
      setScans(data);
      if (data.length > 0 && data[0].status === 'COMPLETED') {
        setActiveScan(data[0]);
        loadReport(data[0].id);
      } else if (data.length > 0 && (data[0].status === 'RUNNING' || data[0].status === 'PENDING')) {
        setActiveScan(data[0]);
        startPolling(data[0].id);
      }
    } catch (err) {
      console.warn('Could not load coverage scans:', err);
    }
  };

  const loadReport = async (scanId) => {
    setLoading(true);
    try {
      const data = await getCoverageReport(scanId);
      setReport(data);
      // Also silently load latest audit
      loadAudit(scanId);
    } catch (err) {
      toast.error(`Failed to load report: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async (scanId) => {
    try {
      const data = await getCoverageAudit(scanId);
      setAuditData(data);
    } catch (err) {
      console.warn('Could not load audit data:', err.message);
    }
  };

  const handleRunAudit = async () => {
    if (!activeScan) return;
    setAuditing(true);
    try {
      toast.loading('Running full data integrity audit...', { id: 'audit' });
      const data = await runCoverageAudit(activeScan.id);
      setAuditData(data);
      toast.success('Integrity audit completed successfully!', { id: 'audit' });
      // Refresh report to reflect any changes
      const updatedReport = await getCoverageReport(activeScan.id);
      setReport(updatedReport);
    } catch (err) {
      toast.error(`Audit failed: ${err.message}`, { id: 'audit' });
    } finally {
      setAuditing(false);
    }
  };

  const startPolling = useCallback((scanId) => {
    setPolling(true);
    const interval = setInterval(async () => {
      try {
        const scan = await getCoverageScan(scanId);
        setActiveScan(scan);
        if (scan.status === 'COMPLETED' || scan.status === 'ERROR') {
          clearInterval(interval);
          setPolling(false);
          if (scan.status === 'COMPLETED') {
            toast.success(`Coverage scan complete! ${scan.scanned_tracks} tracks analyzed.`);
            loadReport(scanId);
          } else {
            toast.error(`Scan failed: ${scan.error_message || 'Unknown error'}`);
          }
        }
      } catch (err) {
        clearInterval(interval);
        setPolling(false);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCancel = async () => {
    if (!activeScan) return;
    try {
      await cancelCoverageScan(activeScan.id);
      toast('Scan cancellation requested.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleExpandTrack = async (track) => {
    if (expandedTrack === track.videoId) {
      setExpandedTrack(null);
      setTrackDetails(null);
      return;
    }
    setExpandedTrack(track.videoId);
    try {
      const details = await getCoverageTrackDetails(activeScan.id, track.videoId);
      setTrackDetails(details);
    } catch (err) {
      toast.error('Failed to load track details');
    }
  };

  const handleConfirmCandidate = async (candidateId) => {
    try {
      await confirmCoverageCandidate(candidateId);
      toast.success('Candidate confirmed.');
      if (activeScan) loadReport(activeScan.id);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Filter tracks
  const filteredTracks = report?.tracks?.filter(t => {
    if (filter === 'authorized' && t.audioStatus !== 'AUTHORIZED') return false;
    if (filter === 'review' && t.audioStatus !== 'NEEDS_REVIEW') return false;
    if (filter === 'unavailable' && t.audioStatus !== 'UNAVAILABLE') return false;
    if (filter === 'synced' && t.lyricsStatus !== 'SYNCHRONIZED') return false;
    if (filter === 'nolyrics' && t.lyricsStatus !== 'UNAVAILABLE') return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (t.title || '').toLowerCase().includes(q) || (t.artist || '').toLowerCase().includes(q);
    }
    return true;
  }) || [];

  // ── Scan Progress View ──
  if (activeScan && (activeScan.status === 'RUNNING' || activeScan.status === 'PENDING')) {
    const pct = activeScan.total_tracks > 0
      ? Math.round((activeScan.scanned_tracks / activeScan.total_tracks) * 100) : 0;

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8">
          <div className="flex items-center gap-3 mb-6">
            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
            <h2 className="text-xl font-bold text-white">Coverage Scan in Progress</h2>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between text-sm text-slate-300">
              <span>Scanning: {activeScan.playlist_title || activeScan.playlist_id}</span>
              <span>{activeScan.scanned_tracks} / {activeScan.total_tracks} tracks</span>
            </div>

            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-600 to-indigo-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">{pct}% complete</span>
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 border border-red-600/30 text-sm hover:bg-red-600/30 transition-colors"
              >
                Cancel Scan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Report View ──
  if (report) {
    const s = report.summary;

    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-purple-400" />
              <h2 className="text-xl font-bold text-white">Coverage Analysis</h2>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={getCoverageCsvUrl(report.scanId)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" /> CSV
              </a>
              <a
                href={getCoverageExportUrl(report.scanId)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition-colors flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" /> JSON
              </a>
            </div>
          </div>
          <p className="text-sm text-slate-400">
            {report.playlistTitle} · {s.totalTracksScanned} tracks scanned
            {report.completedAt && ` · ${new Date(report.completedAt).toLocaleString()}`}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 border-b border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('coverage')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'coverage'
                ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> Coverage Overview
          </button>
          <button
            onClick={() => {
              setActiveTab('audit');
              if (!auditData && activeScan) loadAudit(activeScan.id);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors ${
              activeTab === 'audit'
                ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" /> Data Integrity & Rights Audit
            {auditData && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                auditData.mismatchesDetected > 0 ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}>
                {auditData.mismatchesDetected > 0 ? `${auditData.mismatchesDetected} Mismatches` : '100% Verified'}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'audit' ? (
          <AuditDashboard
            auditData={auditData}
            auditing={auditing}
            onRunAudit={handleRunAudit}
            scanId={report.scanId}
          />
        ) : (
          <>
            {/* Summary Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="TOTAL SCANNED" value={s.totalTracksScanned} color="text-white" />
              <StatCard label="AUTHORIZED AUDIO" value={s.authorizedDownloadableMatches} color="text-emerald-400" />
              <StatCard label="NEEDS REVIEW" value={s.matchesRequiringReview} color="text-amber-400" />
              <StatCard label="UNAVAILABLE" value={s.unavailableTracks} color="text-red-400" />
              <StatCard label="SYNCED LYRICS" value={s.synchronizedLyrics} color="text-cyan-400" />
              <StatCard label="PLAIN LYRICS" value={s.plainLyricsOnly} color="text-blue-400" />
              <StatCard label="NO LYRICS" value={s.noLyrics + (s.lyricsErrors || 0)} color="text-slate-400" />
              <StatCard label="AUDIO + SYNCED" value={s.audioAndSyncedLyrics} color="text-purple-400" />
            </div>

        {/* Provider Comparison */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
            Provider Coverage (unique tracks with valid matches)
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(report.providerCoverage).map(([provider, count]) => {
              const info = PROVIDER_LABELS[provider] || { name: provider, color: 'bg-slate-700 text-slate-300' };
              const pct = s.totalTracksScanned > 0 ? Math.round((count / s.totalTracksScanned) * 100) : 0;
              return (
                <div key={provider} className="bg-slate-800/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${info.color}`}>{info.name}</span>
                    <span className="text-lg font-bold text-white">{count}</span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-1.5">
                    <div className="bg-purple-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{pct}% of playlist</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quality Distribution */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
            Audio Quality Distribution
          </h3>
          <div className="flex gap-4 flex-wrap">
            {Object.entries(report.qualityDistribution).map(([tier, count]) => {
              const info = QUALITY_LABELS[tier] || { label: tier, color: 'text-slate-400' };
              return count > 0 ? (
                <div key={tier} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                  <span className={`text-sm font-semibold ${info.color}`}>{count}</span>
                  <span className="text-xs text-slate-400">{info.label}</span>
                </div>
              ) : null;
            })}
            {Object.entries(report.formatDistribution || {}).map(([fmt, count]) => (
              <div key={fmt} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="text-sm font-semibold text-indigo-400">{count}</span>
                <span className="text-xs text-slate-400">{fmt.toUpperCase()}</span>
              </div>
            ))}
          </div>
          {s.providerErrors > 0 && (
            <p className="text-xs text-amber-400 mt-3">
              ⚠️ {s.providerErrors} provider lookup(s) returned errors during the scan.
            </p>
          )}
        </div>

        {/* Track Filters */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2 flex-wrap">
              {[
                { id: 'all', label: 'All', count: report.tracks.length },
                { id: 'authorized', label: 'Authorized', count: s.authorizedDownloadableMatches },
                { id: 'review', label: 'Needs Review', count: s.matchesRequiringReview },
                { id: 'unavailable', label: 'Unavailable', count: s.unavailableTracks },
                { id: 'synced', label: 'Synced Lyrics', count: s.synchronizedLyrics },
                { id: 'nolyrics', label: 'No Lyrics', count: s.noLyrics },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === f.id
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search tracks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-lg bg-slate-800 text-sm text-slate-200 border border-slate-700 focus:border-purple-500 focus:outline-none w-48"
              />
            </div>
          </div>
        </div>

        {/* Track List */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            {filteredTracks.map((track, idx) => {
              const statusInfo = STATUS_ICONS[track.audioStatus] || STATUS_ICONS.UNAVAILABLE;
              const StatusIcon = statusInfo.icon;
              const isExpanded = expandedTrack === track.videoId;

              return (
                <div key={track.videoId || idx} className="border-b border-slate-800/50 last:border-b-0">
                  <button
                    onClick={() => handleExpandTrack(track)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <StatusIcon className={`w-4 h-4 shrink-0 ${statusInfo.color}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{track.title}</p>
                        <p className="text-xs text-slate-400 truncate">{track.artist}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {track.bestCandidate && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          PROVIDER_LABELS[track.bestCandidate.provider]?.color || 'bg-slate-700 text-slate-300'
                        }`}>
                          {PROVIDER_LABELS[track.bestCandidate.provider]?.name || track.bestCandidate.provider}
                        </span>
                      )}
                      {track.bestCandidate && (
                        <span className="text-xs text-slate-400 font-mono w-10 text-right">
                          {Math.round((track.bestCandidate.matchScore || 0) * 100)}%
                        </span>
                      )}
                      <LyricsBadge status={track.lyricsStatus} />
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-slate-800/20">
                      {track.bestCandidate ? (
                        <div className="space-y-2 text-xs">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <Detail label="Provider" value={PROVIDER_LABELS[track.bestCandidate.provider]?.name} />
                            <Detail label="Match" value={`${Math.round(track.bestCandidate.matchScore * 100)}% (${track.bestCandidate.matchOutcome})`} />
                            <Detail label="Format" value={`${(track.bestCandidate.format || '?').toUpperCase()} · ${track.bestCandidate.qualityTier || 'Unknown'}`} />
                            <Detail label="License" value={track.bestCandidate.licenseName} />
                          </div>
                          {track.bestCandidate.matchReasons?.length > 0 && (
                            <p className="text-slate-500 italic">{track.bestCandidate.matchReasons.join(' ')}</p>
                          )}
                          {track.bestCandidate.sourceUrl && (
                            <a href={track.bestCandidate.sourceUrl} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-purple-400 hover:text-purple-300">
                              <ExternalLink className="w-3 h-3" /> View source
                            </a>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-red-400">{track.rejectionReason || 'No authorized source found'}</p>
                      )}

                      {/* Additional candidates */}
                      {trackDetails && expandedTrack === track.videoId && trackDetails.audio?.length > 1 && (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-xs font-semibold text-slate-400 uppercase">All Candidates ({trackDetails.audio.length})</p>
                          {trackDetails.audio.filter(c => c.match_outcome !== 'PROVIDER_ERROR').map((c, ci) => (
                            <div key={ci} className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`px-1.5 py-0.5 rounded border ${PROVIDER_LABELS[c.provider]?.color || 'bg-slate-700 text-slate-300'}`}>
                                  {PROVIDER_LABELS[c.provider]?.name || c.provider}
                                </span>
                                <span className="text-slate-300 truncate max-w-[200px]">{c.candidate_title}</span>
                                <span className="text-slate-500">by {c.candidate_artist}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-slate-400">{Math.round((c.match_score || 0) * 100)}%</span>
                                <span className={c.match_outcome === 'HIGH_CONFIDENCE' ? 'text-emerald-400' : c.match_outcome === 'NEEDS_REVIEW' ? 'text-amber-400' : 'text-red-400'}>
                                  {c.match_outcome}
                                </span>
                                {c.match_outcome === 'NEEDS_REVIEW' && !c.user_confirmed && (
                                  <button
                                    onClick={() => handleConfirmCandidate(c.id)}
                                    className="px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 hover:bg-emerald-600/30"
                                  >
                                    Confirm
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
          </>
        )}
      </div>
    );
  }

  // ── Empty State ──
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-8 text-center">
        <Scan className="w-12 h-12 text-purple-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Coverage Analysis</h2>
        <p className="text-slate-400 text-sm mb-6 max-w-md mx-auto">
          Scan your playlist against all authorized audio providers and lyrics databases
          to see what's available before downloading.
        </p>
        <p className="text-xs text-slate-500">
          Start a scan from the Download Manager by importing a playlist, or use the API directly.
        </p>
        {scans.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-xs text-slate-400 uppercase font-semibold">Previous Scans</p>
            {scans.slice(0, 5).map(scan => (
              <button
                key={scan.id}
                onClick={() => { setActiveScan(scan); if (scan.status === 'COMPLETED') loadReport(scan.id); }}
                className="w-full flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-2 text-sm hover:bg-slate-800 transition-colors"
              >
                <span className="text-slate-300">{scan.playlist_title || scan.playlist_id}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{scan.scanned_tracks}/{scan.total_tracks}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    scan.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' :
                    scan.status === 'ERROR' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                  }`}>{scan.status}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function StatCard({ label, value, color }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4">
      <p className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase">{label}</p>
      <p className="text-slate-300 truncate">{value || '—'}</p>
    </div>
  );
}

function LyricsBadge({ status }) {
  const configs = {
    VERIFIED_SYNCHRONIZED: { icon: Music, color: 'text-emerald-400', tip: 'Verified Synced' },
    SYNCHRONIZED_NEEDS_REVIEW: { icon: Music, color: 'text-amber-400', tip: 'Synced (Needs Duration Review)' },
    SYNCHRONIZED: { icon: Music, color: 'text-cyan-400', tip: 'Synced' },
    PLAIN: { icon: FileText, color: 'text-blue-400', tip: 'Plain' },
    INSTRUMENTAL: { icon: Mic2, color: 'text-purple-400', tip: 'Instrumental' },
    AMBIGUOUS: { icon: AlertTriangle, color: 'text-amber-400', tip: 'Ambiguous' },
    UNAVAILABLE: { icon: XCircle, color: 'text-slate-600', tip: 'None' },
    ERROR: { icon: XCircle, color: 'text-red-500', tip: 'Error' },
  };
  const cfg = configs[status] || configs.UNAVAILABLE;
  const Icon = cfg.icon;
  return <Icon className={`w-3.5 h-3.5 ${cfg.color}`} title={cfg.tip} />;
}

export default CoverageSection;
