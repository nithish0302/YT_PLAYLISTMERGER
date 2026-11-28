import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  HardDriveDownload,
  ShieldCheck,
  Layers,
  ArrowRight,
  Loader2,
  ClipboardList,
  Sparkles,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';

import {
  getDownloadJobs,
  getDownloadJob,
  getDownloadJobTracks,
  getDownloadJobStats,
  createDownloadJob,
  startDownloadQueue,
  pauseDownloadQueue,
  resumeDownloadQueue,
  cancelDownloadQueue,
  retryFailedDownloads,
  downloadTrack,
  cancelTrackDownload,
  retryTrackDownload,
  searchTrackSources,
  confirmTrackSource,
  confirmTrackLyrics,
  createDownloadEventSource,
  getPlaylistByUrl,
  getPlaylistTracks,
  getImportValidationReport,
  getSnapshots,
} from '../../api';

import DashboardOverview from './DashboardOverview';
import PlaylistDownloadOverview from './PlaylistDownloadOverview';
import TrackTable from './TrackTable';
import RightsReviewModal from './RightsReviewModal';
import LyricsPreviewModal from './LyricsPreviewModal';
import ExportModal from './ExportModal';
import ConfirmationModal from './ConfirmationModal';

export const DownloadsSection = ({ accounts = [], defaultPlaylistId = 'PLMeZARHzcGt0' }) => {
  // Jobs and active state
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);

  // Snapshots & input
  const [snapshots, setSnapshots] = useState([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('');
  const [playlistInput, setPlaylistInput] = useState(defaultPlaylistId);
  const [importingPlaylist, setImportingPlaylist] = useState(false);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [lyricsFilter, setLyricsFilter] = useState('ALL');

  // Modals state
  const [rightsModalTrack, setRightsModalTrack] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const [lyricsModalTrack, setLyricsModalTrack] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Confirmation dialogs state
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    isDestructive: false,
    onConfirm: () => {},
  });

  const sseRef = useRef(null);

  // ── Load initial jobs and snapshots ──
  const fetchInitialData = useCallback(async () => {
    try {
      const [jobsList, snapsList] = await Promise.all([
        getDownloadJobs(),
        getSnapshots().catch(() => []),
      ]);
      setJobs(jobsList);
      setSnapshots(snapsList);

      if (!activeJobId && jobsList.length > 0) {
        setActiveJobId(jobsList[0].id);
      }
    } catch (err) {
      console.warn('Could not load initial jobs or snapshots:', err);
    }
  }, [activeJobId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // ── Load active job, tracks & live stats ──
  const loadJobData = useCallback(async (jobId) => {
    if (!jobId) return;
    try {
      setLoading(true);
      const [jobData, trackList, jobStats] = await Promise.all([
        getDownloadJob(jobId),
        getDownloadJobTracks(jobId),
        getDownloadJobStats(jobId).catch(() => ({})),
      ]);
      setActiveJob(jobData);
      setTracks(trackList);
      setStats(jobStats);
    } catch (err) {
      console.error('Failed to load job details:', err);
      toast.error('Failed to load download job details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeJobId) {
      loadJobData(activeJobId);
    }
  }, [activeJobId, loadJobData]);

  // ── Refresh live stats independently ──
  const refreshStats = useCallback(async (jobId) => {
    if (!jobId) return;
    try {
      const jobStats = await getDownloadJobStats(jobId);
      setStats(jobStats);
    } catch (e) {
      // silent background refresh error catch
    }
  }, []);

  // ── SSE Live Updates ──
  useEffect(() => {
    if (!activeJobId) return;

    if (sseRef.current) {
      sseRef.current.close();
    }

    const sse = createDownloadEventSource(activeJobId);
    sseRef.current = sse;

    sse.onopen = () => {
      // Re-sync full job data from API on connection / reconnection
      loadJobData(activeJobId);
    };

    sse.addEventListener('sync_state', () => {
      loadJobData(activeJobId);
    });

    sse.addEventListener('track_progress', (e) => {
      try {
        const payload = JSON.parse(e.data);
        setTracks((prev) =>
          prev.map((t) =>
            t.id === payload.trackId
              ? { ...t, download_progress: payload.progress }
              : t
          )
        );
      } catch (err) {
        console.warn('SSE progress parse error:', err);
      }
    });

    sse.addEventListener('track_updated', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.track) {
          setTracks((prev) =>
            prev.map((t) => (t.id === payload.track.id ? { ...t, ...payload.track } : t))
          );
        }
        refreshStats(activeJobId);
      } catch (err) {
        console.warn('SSE track update parse error:', err);
      }
    });

    sse.addEventListener('job_updated', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.job) {
          setActiveJob(payload.job);
        }
        refreshStats(activeJobId);
      } catch (err) {
        console.warn('SSE job update parse error:', err);
      }
    });

    return () => {
      sse.close();
    };
  }, [activeJobId, refreshStats]);

  // ── Import Playlist / Create Job ──
  const handleImportAndCreateJob = async () => {
    if (!playlistInput.trim() && !selectedSnapshotId) {
      toast.error('Please select a snapshot or enter a YouTube playlist link.');
      return;
    }

    setImportingPlaylist(true);
    const toastId = toast.loading('Initializing playlist download job...');

    try {
      let newJob;

      if (selectedSnapshotId) {
        toast.loading(`Loading verified snapshot (${selectedSnapshotId})...`, { id: toastId });
        newJob = await createDownloadJob({
          snapshotId: selectedSnapshotId,
        });
      } else {
        let playlistId = playlistInput.trim();
        let playlistTitle = 'Imported Playlist';
        let rawItemCount = null;

        const plInfo = await getPlaylistByUrl(playlistInput.trim(), accounts[0]?.id).catch(() => null);
        if (plInfo && plInfo.id) {
          playlistId = plInfo.id;
          playlistTitle = plInfo.title;
          rawItemCount = plInfo.itemCount || null;
        }

        toast.loading(`Importing tracks for "${playlistTitle}"...`, { id: toastId });
        const fetchedTracks = await getPlaylistTracks(playlistId, accounts[0]?.id);

        if (!fetchedTracks || fetchedTracks.length === 0) {
          throw new Error('No tracks found in this playlist.');
        }

        newJob = await createDownloadJob({
          playlistId,
          playlistTitle,
          tracks: fetchedTracks,
          rawItemCount,
        });
      }

      toast.success(`Initialized download job for ${newJob.total_tracks} tracks!`, { id: toastId });
      await fetchInitialData();
      setActiveJobId(newJob.id);
    } catch (err) {
      console.error('Import error:', err);
      toast.error(`Import failed: ${err.response?.data?.error || err.message}`, { id: toastId });
    } finally {
      setImportingPlaylist(false);
    }
  };

  // ── Queue Controls ──
  const handleStartQueue = async () => {
    if (!activeJobId) return;
    try {
      await startDownloadQueue(activeJobId);
      toast.success('Download queue started (2 concurrent workers).');
      loadJobData(activeJobId);
    } catch (err) {
      toast.error('Failed to start download queue.');
    }
  };

  const handlePauseQueue = async () => {
    if (!activeJobId) return;
    try {
      await pauseDownloadQueue(activeJobId);
      toast('Download queue paused.');
      loadJobData(activeJobId);
    } catch (err) {
      toast.error('Failed to pause download queue.');
    }
  };

  const handleResumeQueue = async () => {
    if (!activeJobId) return;
    try {
      await resumeDownloadQueue(activeJobId);
      toast.success('Download queue resumed.');
      loadJobData(activeJobId);
    } catch (err) {
      toast.error('Failed to resume download queue.');
    }
  };

  const handleCancelQueueClick = () => {
    setConfirmState({
      isOpen: true,
      title: 'Cancel Download Queue?',
      message: 'Are you sure you want to cancel the entire queue? Any currently streaming downloads will be aborted, partial files cleaned up, and queued tracks marked as cancelled.',
      confirmLabel: 'Cancel Queue',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          await cancelDownloadQueue(activeJobId);
          toast.success('Download queue cancelled.');
          loadJobData(activeJobId);
        } catch (err) {
          toast.error('Failed to cancel download queue.');
        }
      },
    });
  };

  const handleRetryFailedClick = () => {
    setConfirmState({
      isOpen: true,
      title: 'Retry Failed Tracks?',
      message: 'This will reset all failed tracks back to ready and requeue them for download.',
      confirmLabel: 'Retry All Failed',
      isDestructive: false,
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          await retryFailedDownloads(activeJobId);
          toast.success('Retrying failed tracks.');
          loadJobData(activeJobId);
        } catch (err) {
          toast.error('Failed to retry failed tracks.');
        }
      },
    });
  };

  // ── Track Level Actions ──
  const handleDownloadSingle = async (trackId) => {
    try {
      await downloadTrack(trackId);
      toast.success('Track queued for download.');
      loadJobData(activeJobId);
    } catch (err) {
      toast.error('Could not queue track download.');
    }
  };

  const handleCancelTrackClick = (trackId) => {
    setConfirmState({
      isOpen: true,
      title: 'Cancel Track Download?',
      message: 'Are you sure you want to cancel this track download? Any partial downloaded file will be cleaned up.',
      confirmLabel: 'Cancel Track',
      isDestructive: true,
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
        try {
          await cancelTrackDownload(trackId);
          toast('Track download cancelled.');
          loadJobData(activeJobId);
        } catch (err) {
          toast.error('Could not cancel track.');
        }
      },
    });
  };

  const handleRetryTrack = async (trackId) => {
    try {
      await retryTrackDownload(trackId);
      toast.success('Track retried and requeued.');
      loadJobData(activeJobId);
    } catch (err) {
      toast.error('Could not retry track.');
    }
  };

  // ── Rights Review Modal Handlers ──
  const handleOpenRightsReview = async (track) => {
    setRightsModalTrack(track);
    setLoadingCandidates(true);
    setCandidates([]);
    try {
      const results = await searchTrackSources(track.id);
      setCandidates(results);
    } catch (err) {
      toast.error('Failed to search audio providers.');
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleSelectCandidate = async (candidate) => {
    if (!rightsModalTrack) return;
    try {
      await confirmTrackSource(rightsModalTrack.id, {
        provider: candidate.provider,
        sourceTrackId: candidate.providerTrackId,
      });
      toast.success(`Matched to "${candidate.title}" via ${candidate.provider} (${candidate.format?.toUpperCase()})`);
      setRightsModalTrack(null);
      loadJobData(activeJobId);
    } catch (err) {
      toast.error(`Confirmation failed: ${err.message}`);
    }
  };

  // ── Lyrics Modal Handlers ──
  const handleOpenLyricsModal = (track) => {
    setLyricsModalTrack(track);
  };

  const handleConfirmLyrics = async (trackId, confirmed) => {
    try {
      await confirmTrackLyrics(trackId, confirmed);
      toast.success(confirmed ? 'Lyrics match verified.' : 'Lyrics match rejected.');
      setLyricsModalTrack(null);
      loadJobData(activeJobId);
    } catch (err) {
      toast.error('Failed to update lyrics confirmation.');
    }
  };

  // ── Filtered Tracks ──
  const filteredTracks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tracks.filter((t) => {
      // Status Filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'DOWNLOADED') {
          if (!['COMPLETED', 'PARTIAL'].includes(t.download_status)) return false;
        } else if (statusFilter === 'QUEUED') {
          if (!['READY', 'PENDING'].includes(t.download_status)) return false;
        } else if (t.download_status !== statusFilter) {
          return false;
        }
      }

      // Lyrics Filter
      if (lyricsFilter !== 'ALL') {
        if (lyricsFilter === 'SYNCHRONIZED') {
          if (!['VERIFIED_SYNCHRONIZED', 'SYNCHRONIZED'].includes(t.lyrics_status)) return false;
        } else if (lyricsFilter === 'USER_CONFIRMED') {
          if (t.lyrics_status !== 'USER_CONFIRMED_MATCH') return false;
        } else if (lyricsFilter === 'NEEDS_REVIEW') {
          if (t.lyrics_status !== 'SYNCHRONIZED_NEEDS_REVIEW' && !t.needs_confirmation) return false;
        } else if (lyricsFilter === 'PLAIN') {
          if (t.lyrics_status !== 'PLAIN') return false;
        } else if (lyricsFilter === 'UNAVAILABLE') {
          if (['VERIFIED_SYNCHRONIZED', 'SYNCHRONIZED', 'USER_CONFIRMED_MATCH', 'PLAIN', 'INSTRUMENTAL'].includes(t.lyrics_status)) return false;
        }
      }

      // Search Query
      if (q) {
        const titleMatch = t.title?.toLowerCase().includes(q);
        const artistMatch = t.artist?.toLowerCase().includes(q);
        if (!titleMatch && !artistMatch) return false;
      }

      return true;
    });
  }, [tracks, searchQuery, statusFilter, lyricsFilter]);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 backdrop-blur">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-full border border-purple-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Phase 5 Download Manager Suite
            </span>
          </div>
          <h2 className="text-xl font-bold text-white mt-1.5 flex items-center gap-2">
            <HardDriveDownload className="w-6 h-6 text-purple-400" />
            Playlist Download Manager & Library Exporter
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Complete management from playlist import to authorized multi-provider audio matching, LRCLIB lyrics sync, real bitrate verification, and final ZIP export.
          </p>
        </div>

        {/* Existing Jobs Selector */}
        {jobs.length > 0 && (
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 px-3.5 py-2 rounded-xl text-xs">
            <Layers className="w-4 h-4 text-purple-400 shrink-0" />
            <select
              value={activeJobId || ''}
              onChange={(e) => setActiveJobId(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer max-w-[220px] truncate"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id} className="bg-slate-900 text-white">
                  {j.playlist_title} ({j.total_tracks} tracks)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Import / Snapshot Selection Card */}
      <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-3xl space-y-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
          Import Playlist or Select Snapshot
        </span>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
          {/* Snapshot selector (v1 176 tracks vs v2 181 tracks) */}
          <div className="lg:col-span-4">
            <select
              value={selectedSnapshotId}
              onChange={(e) => {
                setSelectedSnapshotId(e.target.value);
                if (e.target.value) setPlaylistInput('');
              }}
              className="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 font-medium"
            >
              <option value="">-- Choose Verified Snapshot --</option>
              {snapshots.map((snap) => (
                <option key={snap.id} value={snap.id}>
                  {snap.versionLabel || snap.id} ({snap.trackCount} tracks)
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-1 text-center text-xs text-slate-500 font-bold uppercase">
            OR
          </div>

          {/* Direct URL input */}
          <div className="lg:col-span-5">
            <input
              type="text"
              value={playlistInput}
              onChange={(e) => {
                setPlaylistInput(e.target.value);
                if (e.target.value) setSelectedSnapshotId('');
              }}
              placeholder="Paste YouTube Playlist URL or ID (e.g. PLMeZARHzcGt0)"
              className="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>

          {/* Action Button */}
          <div className="lg:col-span-2">
            <button
              onClick={handleImportAndCreateJob}
              disabled={importingPlaylist}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 disabled:opacity-40 text-white font-semibold text-xs px-4 py-3 rounded-xl shadow-lg shadow-purple-600/30 transition-all shrink-0"
            >
              {importingPlaylist ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading…</span>
                </>
              ) : (
                <>
                  <span>Load Job</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Active Job Content */}
      {activeJob && (
        <div className="space-y-6">
          {/* 1. Dashboard Overview */}
          <DashboardOverview stats={stats} loading={loading} />

          {/* 2. Playlist Download Overview */}
          <PlaylistDownloadOverview
            activeJob={activeJob}
            stats={stats}
            onStartQueue={handleStartQueue}
            onPauseQueue={handlePauseQueue}
            onResumeQueue={handleResumeQueue}
            onCancelQueueClick={handleCancelQueueClick}
            onRetryFailedClick={handleRetryFailedClick}
            onOpenExportModal={() => setShowExportModal(true)}
          />

          {/* 3 & 4. Track Table with Status Filters and Search */}
          <TrackTable
            tracks={filteredTracks}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            lyricsFilter={lyricsFilter}
            onLyricsFilterChange={setLyricsFilter}
            onDownloadTrack={handleDownloadSingle}
            onRetryTrack={handleRetryTrack}
            onCancelTrack={handleCancelTrackClick}
            onOpenRightsReview={handleOpenRightsReview}
            onOpenLyricsModal={handleOpenLyricsModal}
          />
        </div>
      )}

      {/* Empty State Fallback */}
      {!activeJob && !loading && (
        <div className="bg-slate-900/20 border border-dashed border-slate-800 rounded-3xl p-12 text-center space-y-3">
          <Layers className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-300">No Download Job Active</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Select a verified playlist snapshot (176 tracks or 181 tracks) or paste a playlist URL above to load tracks and begin managing downloads.
          </p>
        </div>
      )}

      {/* Rights Review Modal */}
      <RightsReviewModal
        track={rightsModalTrack}
        candidates={candidates}
        loading={loadingCandidates}
        onClose={() => setRightsModalTrack(null)}
        onSelectCandidate={handleSelectCandidate}
      />

      {/* Lyrics Preview Modal */}
      <LyricsPreviewModal
        track={lyricsModalTrack}
        onClose={() => setLyricsModalTrack(null)}
        onConfirmLyrics={handleConfirmLyrics}
      />

      {/* Export Verified Library Modal */}
      <ExportModal
        activeJobId={activeJobId}
        stats={stats}
        onClose={() => setShowExportModal(false)}
      />

      {/* Generic Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        isDestructive={confirmState.isDestructive}
        onConfirm={confirmState.onConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};

export default DownloadsSection;
