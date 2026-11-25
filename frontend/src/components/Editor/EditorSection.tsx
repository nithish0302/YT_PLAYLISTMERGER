import React, { useState, useMemo } from 'react';
import {
  SlidersHorizontal,
  Search,
  ArrowRight,
  Eye,
  RotateCcw,
  X,
  ArrowUpDown,
  Filter,
  Trash2,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import TrackRow from './TrackRow';
import type { Track } from '../../types';

interface EditorSectionProps {
  tracks: Track[];
  playlistName: string;
  playlistDescription: string;
  onUpdatePlaylistName: (name: string) => void;
  onUpdatePlaylistDescription: (desc: string) => void;
  onReorderTracks: (newTracks: Track[]) => void;
  onRemoveTrack: (index: number) => void;
  onRestoreTrack: (index: number) => void;
  onRestoreAllTracks: () => void;
  onProceedToExport: () => void;
}

export const EditorSection: React.FC<EditorSectionProps> = ({
  tracks,
  playlistName,
  playlistDescription,
  onUpdatePlaylistName,
  onUpdatePlaylistDescription,
  onReorderTracks,
  onRemoveTrack,
  onRestoreTrack,
  onRestoreAllTracks,
  onProceedToExport,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [sortAsc, setSortAsc] = useState<boolean | null>(null);
  const [selectedPlaylistFilter, setSelectedPlaylistFilter] = useState<string>('all');

  const activeTracksCount = useMemo(
    () => tracks.filter((t) => !t.isRemoved).length,
    [tracks]
  );
  const removedTracksCount = tracks.length - activeTracksCount;

  // Distinct source playlists in the combined dataset
  const uniqueSourcePlaylists = useMemo(() => {
    const set = new Set<string>();
    tracks.forEach((t) => {
      if (t.playlistTitle) set.add(t.playlistTitle);
    });
    return Array.from(set);
  }, [tracks]);

  // Sort by Name (A-Z / Z-A)
  const handleSortByName = () => {
    const nextAsc = sortAsc === true ? false : true;
    setSortAsc(nextAsc);
    const sorted = [...tracks].sort((a, b) => {
      const cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      return nextAsc ? cmp : -cmp;
    });
    onReorderTracks(sorted);
  };

  // Filtered tracks for search and playlist filter
  const filteredIndices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return tracks
      .map((t, idx) => ({ t, idx }))
      .filter(({ t }) => {
        if (selectedPlaylistFilter !== 'all' && t.playlistTitle !== selectedPlaylistFilter) {
          return false;
        }
        if (q && !t.title.toLowerCase().includes(q) && !t.artist.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      })
      .map(({ idx }) => idx);
  }, [tracks, searchQuery, selectedPlaylistFilter]);

  // Bulk remove songs from currently filtered view
  const handleRemoveFilteredTracks = () => {
    filteredIndices.forEach((idx) => {
      onRemoveTrack(idx);
    });
  };

  // Drag and drop reordering
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;

    const sourceOriginalIndex = filteredIndices[result.source.index];
    const destOriginalIndex = filteredIndices[result.destination.index];

    const reordered = Array.from(tracks);
    const [moved] = reordered.splice(sourceOriginalIndex, 1);
    reordered.splice(destOriginalIndex, 0, moved);

    onReorderTracks(reordered);
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const reordered = Array.from(tracks);
    const temp = reordered[index - 1];
    reordered[index - 1] = reordered[index];
    reordered[index] = temp;
    onReorderTracks(reordered);
  };

  const handleMoveDown = (index: number) => {
    if (index >= tracks.length - 1) return;
    const reordered = Array.from(tracks);
    const temp = reordered[index + 1];
    reordered[index + 1] = reordered[index];
    reordered[index] = temp;
    onReorderTracks(reordered);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-purple-400" />
            Final Playlist Editor
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Customize playlist metadata, drag-and-drop to reorder, and finalize your song list before creating on YouTube Music.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreviewModal(true)}
            className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs px-4 py-2.5 rounded-xl border border-slate-700 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Preview Final ({activeTracksCount})
          </button>

          <button
            onClick={onProceedToExport}
            disabled={activeTracksCount === 0}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 disabled:opacity-40 text-white font-semibold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-purple-600/30 transition-all hover:scale-105 shrink-0"
          >
            <span>Choose Destination & Export</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Playlist Metadata Customization */}
      <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl space-y-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
          Playlist Metadata
        </span>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Playlist Name</label>
            <input
              type="text"
              value={playlistName}
              onChange={(e) => onUpdatePlaylistName(e.target.value)}
              placeholder="My Combined Playlist"
              className="w-full bg-slate-950 border border-slate-800 text-white text-sm font-semibold rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Description (optional)</label>
            <input
              type="text"
              value={playlistDescription}
              onChange={(e) => onUpdatePlaylistDescription(e.target.value)}
              placeholder="Centralized playlist created with Playlist Centralizer"
              className="w-full bg-slate-950 border border-slate-800 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl">
        {/* Left: Search + Filter + Sort */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search songs or artists..."
              className="w-full bg-slate-950 border border-slate-800 pl-10 pr-8 py-2 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-purple-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs p-1"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter by Playlist */}
          {uniqueSourcePlaylists.length > 1 && (
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-xl">
              <Filter className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <select
                value={selectedPlaylistFilter}
                onChange={(e) => setSelectedPlaylistFilter(e.target.value)}
                className="bg-transparent text-xs text-slate-300 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-slate-900 text-white">All Playlists ({uniqueSourcePlaylists.length})</option>
                {uniqueSourcePlaylists.map((title) => (
                  <option key={title} value={title} className="bg-slate-900 text-white">
                    {title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sort Alphabetically A-Z / Z-A */}
          <button
            onClick={handleSortByName}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition-all ${
              sortAsc !== null
                ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 shadow-sm'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
            }`}
            title="Sort all tracks alphabetically by title"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-purple-400" />
            <span>
              {sortAsc === true ? 'Name (A → Z)' : sortAsc === false ? 'Name (Z → A)' : 'Sort A-Z'}
            </span>
          </button>

          {/* Bulk remove button if filtered by a specific playlist */}
          {selectedPlaylistFilter !== 'all' && filteredIndices.length > 0 && (
            <button
              onClick={handleRemoveFilteredTracks}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors"
              title={`Remove all songs belonging to ${selectedPlaylistFilter}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove all from "{selectedPlaylistFilter}"</span>
            </button>
          )}
        </div>

        {/* Right: Counter and Restore all */}
        <div className="flex items-center gap-3 justify-between sm:justify-end shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
          <span className="text-xs text-slate-400 font-mono">
            Showing <strong className="text-white">{filteredIndices.length}</strong> of{' '}
            <strong className="text-purple-400">{activeTracksCount}</strong> active
          </span>

          {removedTracksCount > 0 && (
            <button
              onClick={onRestoreAllTracks}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-950 border border-slate-800 hover:bg-slate-800 px-3 py-1.5 rounded-xl transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Restore All ({removedTracksCount})
            </button>
          )}
        </div>
      </div>

      {/* Reorderable Tracks List */}
      <div className="space-y-2">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="tracks-list">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="space-y-2"
              >
                {filteredIndices.length === 0 ? (
                  <div className="border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs">
                    No songs match "{searchQuery}"
                  </div>
                ) : (
                  filteredIndices.map((origIndex, filteredIndex) => {
                    const track = tracks[origIndex];
                    return (
                      <Draggable
                        key={`${track.videoId}_${origIndex}`}
                        draggableId={`${track.videoId}_${origIndex}`}
                        index={filteredIndex}
                        isDragDisabled={Boolean(track.isRemoved) || Boolean(searchQuery)}
                      >
                        {(dragProvided) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                          >
                            <TrackRow
                              track={track}
                              index={origIndex}
                              onRemove={onRemoveTrack}
                              onRestore={onRestoreTrack}
                              onMoveUp={handleMoveUp}
                              onMoveDown={handleMoveDown}
                              isFirst={origIndex === 0}
                              isLast={origIndex === tracks.length - 1}
                              dragHandleProps={dragProvided.dragHandleProps}
                            />
                          </div>
                        )}
                      </Draggable>
                    );
                  })
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base">{playlistName}</h3>
                <p className="text-xs text-slate-400">
                  {activeTracksCount} unique tracks ready for YouTube Music
                </p>
              </div>
              <button
                onClick={() => setShowPreviewModal(null as any)}
                className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-2">
              {tracks
                .filter((t) => !t.isRemoved)
                .map((track, i) => (
                  <div
                    key={`${track.videoId}_${i}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80"
                  >
                    <span className="w-7 text-center text-xs font-mono text-slate-500">
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
                ))}
            </div>

            <div className="p-4 border-t border-slate-800 flex justify-between items-center">
              <span className="text-xs text-slate-400">
                Will be published as <strong>Private</strong> by default
              </span>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  onProceedToExport();
                }}
                className="text-xs font-semibold px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl shadow-lg shadow-purple-600/30 transition-all"
              >
                Proceed to Export →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default EditorSection;
