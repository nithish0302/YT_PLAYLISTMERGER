import React, { useState } from 'react';
import {
  Copy,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';

export const DuplicatesSection = ({
  tracks,
  exactGroups,
  possibleGroups,
  stats,
  onFindDuplicates,
  onRemoveExactDuplicates,
  onRemoveSelectedDuplicates,
  onRestoreAll,
  onUpdateGroupKeepIndex,
  onProceedToEditor,
}) => {
  const [activeTab, setActiveTab] = useState('exact');
  const [selectedPossibleGroupKeys, setSelectedPossibleGroupKeys] = useState(new Set());

  // Toggle selection for possible duplicate groups
  const toggleSelectPossibleGroup = (key) => {
    setSelectedPossibleGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllPossible = () => {
    setSelectedPossibleGroupKeys(new Set(possibleGroups.map((g) => g.key)));
  };

  const deselectAllPossible = () => {
    setSelectedPossibleGroupKeys(new Set());
  };

  const handleApplySelectedPossible = () => {
    const toResolve = possibleGroups.filter((g) => selectedPossibleGroupKeys.has(g.key));
    onRemoveSelectedDuplicates(toResolve);
    setSelectedPossibleGroupKeys(new Set());
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Copy className="w-5 h-5 text-purple-400" />
            Duplicate Manager
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Detect exact video ID matches across playlists and review title/artist similarities with full approval control.
          </p>
        </div>

        <button
          onClick={onProceedToEditor}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 transition-all hover:scale-105 shrink-0"
        >
          <span>Continue to Editor</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Real-time Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Total Imported
          </span>
          <p className="text-2xl font-bold font-mono text-white mt-1">{stats.totalImported}</p>
          <span className="text-[10px] text-slate-500">Across all playlists</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
            Unique Tracks
          </span>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{stats.uniqueTracks}</p>
          <span className="text-[10px] text-slate-500">Distinct video IDs</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
            Exact Duplicates
          </span>
          <p className="text-2xl font-bold font-mono text-rose-400 mt-1">{stats.exactDuplicates}</p>
          <span className="text-[10px] text-slate-500">Identical video IDs</span>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-2xl">
          <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider block">
            Possible Duplicates
          </span>
          <p className="text-2xl font-bold font-mono text-amber-400 mt-1">{stats.possibleDuplicates}</p>
          <span className="text-[10px] text-slate-500">Similar name & artist</span>
        </div>

        <div className="bg-slate-900/80 border border-purple-500/30 p-4 rounded-2xl bg-purple-950/20">
          <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider block">
            After Cleanup
          </span>
          <p className="text-2xl font-bold font-mono text-purple-300 mt-1">{stats.afterCleanup}</p>
          <span className="text-[10px] text-purple-400/70">Songs to be exported</span>
        </div>
      </div>

      {/* Action Buttons Toolbar */}
      <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center gap-3">
        {/* 1. Find Duplicates */}
        <button
          onClick={onFindDuplicates}
          className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-4 py-2.5 rounded-xl border border-slate-700 transition-colors"
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          Find Duplicates
        </button>

        {/* 2. Remove Exact Duplicates */}
        <button
          onClick={onRemoveExactDuplicates}
          disabled={stats.exactDuplicates === 0}
          className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-rose-600/20 transition-colors"
        >
          <CheckCircle2 className="w-4 h-4" />
          Remove Exact Duplicates ({stats.exactDuplicates})
        </button>

        {/* 3. Review Possible Duplicates */}
        <button
          onClick={() => setActiveTab('possible')}
          className={`inline-flex items-center gap-2 font-semibold text-xs px-4 py-2.5 rounded-xl border transition-colors ${
            activeTab === 'possible'
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          Review Possible Duplicates ({possibleGroups.length})
        </button>

        {/* 4. Remove Selected Duplicates */}
        {activeTab === 'possible' && (
          <button
            onClick={handleApplySelectedPossible}
            disabled={selectedPossibleGroupKeys.size === 0}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-purple-600/20 transition-colors"
          >
            Remove Selected ({selectedPossibleGroupKeys.size})
          </button>
        )}

        {/* 5. Restore Removed Songs */}
        <button
          onClick={onRestoreAll}
          disabled={stats.afterCleanup === stats.totalImported}
          className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 hover:text-white font-medium text-xs px-4 py-2.5 rounded-xl border border-slate-700 transition-colors ml-auto"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restore Removed Songs
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('exact')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'exact'
              ? 'border-purple-500 text-purple-400 bg-purple-500/5 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Exact Video ID Duplicates</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
            {exactGroups.length} groups
          </span>
        </button>

        <button
          onClick={() => setActiveTab('possible')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'possible'
              ? 'border-purple-500 text-purple-400 bg-purple-500/5 rounded-t-xl'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Possible Song-Name Duplicates</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
            {possibleGroups.length}
          </span>
        </button>
      </div>

      {/* ── MODE 1: EXACT DUPLICATES ── */}
      {activeTab === 'exact' && (
        <div className="space-y-4">
          {exactGroups.length === 0 ? (
            <div className="border border-slate-800 rounded-2xl p-12 text-center bg-slate-900/30">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <h4 className="font-bold text-white text-base">No Exact Duplicates Found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                All tracks in your combined playlists have unique YouTube video IDs.
              </p>
            </div>
          ) : (
            exactGroups.map((group) => (
              <div
                key={group.key}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      Exact Duplicate Group
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Video ID: {group.tracks[0].videoId}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    Appears in <strong>{group.tracks.length}</strong> playlists
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {group.tracks.map((track, idx) => {
                    const isKept = group.keepIndex === idx;
                    return (
                      <div
                        key={`${track.videoId}_${idx}`}
                        onClick={() => onUpdateGroupKeepIndex('exact', group.key, idx)}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          isKept
                            ? 'bg-emerald-950/20 border-emerald-500/50 ring-1 ring-emerald-500/30'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-60'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`keep_${group.key}`}
                          checked={isKept}
                          onChange={() => onUpdateGroupKeepIndex('exact', group.key, idx)}
                          className="w-4 h-4 text-emerald-500 focus:ring-0 cursor-pointer"
                        />
                        <img
                          src={track.thumbnail}
                          alt={track.title}
                          className="w-12 h-12 rounded-lg object-cover bg-slate-800 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white truncate">{track.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">{track.artist}</p>
                          <span className="text-[10px] text-purple-400 font-medium">
                            {track.playlistTitle || 'Source Playlist'}
                          </span>
                        </div>
                        {isKept && (
                          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30 shrink-0">
                            Keep This
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── MODE 2: POSSIBLE DUPLICATES ── */}
      {activeTab === 'possible' && (
        <div className="space-y-4">
          {/* Top note */}
          <div className="flex items-start gap-2.5 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-1">
              <p>
                <strong>Human approval required:</strong> These songs share similar normalized titles and artists but have different YouTube video IDs.
              </p>
              <p className="text-slate-400">
                They might be different video uploads, live versions, remixes, or acoustic covers. Choose which version to retain, select the checkboxes, and click "Remove Selected".
              </p>
            </div>
          </div>

          {possibleGroups.length > 0 && (
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <div className="flex items-center gap-3">
                <button
                  onClick={selectAllPossible}
                  className="text-purple-400 hover:text-purple-300 font-medium underline"
                >
                  Select All
                </button>
                <span>•</span>
                <button
                  onClick={deselectAllPossible}
                  className="text-slate-400 hover:text-slate-200"
                >
                  Deselect All
                </button>
              </div>
              <span>
                Selected: <strong>{selectedPossibleGroupKeys.size}</strong> of {possibleGroups.length} groups
              </span>
            </div>
          )}

          {possibleGroups.length === 0 ? (
            <div className="border border-slate-800 rounded-2xl p-12 text-center bg-slate-900/30">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
              <h4 className="font-bold text-white text-base">No Potential Song-Name Duplicates Found</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                No songs with conflicting versions or similar title-artist combinations were detected.
              </p>
            </div>
          ) : (
            possibleGroups.map((group) => {
              const isChecked = selectedPossibleGroupKeys.has(group.key);
              return (
                <div
                  key={group.key}
                  className={`bg-slate-900 border rounded-2xl p-5 space-y-3 transition-colors ${
                    isChecked ? 'border-amber-500/40 ring-1 ring-amber-500/20' : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectPossibleGroup(group.key)}
                        className="w-4 h-4 rounded text-purple-600 focus:ring-0 bg-slate-950 border-slate-700 cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-white">
                          "{group.normalizedTitle}" by {group.normalizedArtist || 'Unknown'}
                        </span>
                        <span className="text-[11px] text-amber-400 ml-2">
                          ({group.tracks.length} different uploads found)
                        </span>
                      </div>
                    </label>

                    <span className="text-[11px] text-slate-500 font-mono">
                      Choose which upload to keep:
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {group.tracks.map((track, idx) => {
                      const isKept = group.keepIndex === idx;
                      return (
                        <div
                          key={`${track.videoId}_${idx}`}
                          onClick={() => onUpdateGroupKeepIndex('possible', group.key, idx)}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            isKept
                              ? 'bg-emerald-950/20 border-emerald-500/50 ring-1 ring-emerald-500/30'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 opacity-60'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`keep_possible_${group.key}`}
                            checked={isKept}
                            onChange={() => onUpdateGroupKeepIndex('possible', group.key, idx)}
                            className="w-4 h-4 text-emerald-500 focus:ring-0 cursor-pointer"
                          />
                          <img
                            src={track.thumbnail}
                            alt={track.title}
                            className="w-12 h-12 rounded-lg object-cover bg-slate-800 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white truncate">{track.title}</p>
                            <p className="text-[11px] text-slate-400 truncate">
                              Channel: {track.artist}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              ID: {track.videoId}
                            </p>
                          </div>
                          {isKept && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30 shrink-0">
                              Version to Keep
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default DuplicatesSection;
