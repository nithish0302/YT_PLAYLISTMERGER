import React from 'react';
import { GripVertical, Trash2, RotateCcw, Music, ExternalLink } from 'lucide-react';

export const TrackRow = ({
  track,
  index,
  onRemove,
  onRestore,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  dragHandleProps,
}) => {
  const isRemoved = Boolean(track.isRemoved);

  return (
    <div
      className={`group flex items-center gap-3 p-3 rounded-2xl border transition-all ${
        isRemoved
          ? 'bg-slate-950/40 border-slate-900 opacity-40 line-through'
          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 hover:shadow-md'
      }`}
    >
      {/* Drag Handle */}
      <div
        {...dragHandleProps}
        className="cursor-grab active:cursor-grabbing text-slate-600 group-hover:text-slate-400 p-1"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Index Number */}
      <span className="w-7 text-center text-xs font-mono text-slate-500 shrink-0">
        {index + 1}
      </span>

      {/* Thumbnail */}
      <div className="w-11 h-11 rounded-xl bg-slate-950 overflow-hidden shrink-0 border border-slate-800">
        {track.thumbnail ? (
          <img
            src={track.thumbnail}
            alt={track.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600">
            <Music className="w-4 h-4" />
          </div>
        )}
      </div>

      {/* Track Details */}
      <div className="min-w-0 flex-1">
        <h4 className="text-xs font-semibold text-white truncate group-hover:text-purple-300 transition-colors">
          {track.title}
        </h4>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[11px] text-slate-400 truncate">{track.artist}</p>
          {track.playlistTitle && (
            <>
              <span className="text-slate-600 text-[10px]">•</span>
              <span className="text-[10px] text-purple-400 truncate max-w-[140px]">
                {track.playlistTitle}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Quick Move Up/Down Controls */}
      <div className="hidden sm:flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onMoveUp && (
          <button
            onClick={() => onMoveUp(index)}
            disabled={isFirst || isRemoved}
            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 text-xs"
            title="Move Up"
          >
            ↑
          </button>
        )}
        {onMoveDown && (
          <button
            onClick={() => onMoveDown(index)}
            disabled={isLast || isRemoved}
            className="p-1 text-slate-400 hover:text-white disabled:opacity-30 rounded hover:bg-slate-800 text-xs"
            title="Move Down"
          >
            ↓
          </button>
        )}
      </div>

      {/* External link to YouTube */}
      {track.videoId && (
        <a
          href={`https://music.youtube.com/watch?v=${track.videoId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors"
          title="Preview track on YouTube Music"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}

      {/* Remove / Restore Action */}
      <div>
        {isRemoved ? (
          <button
            onClick={() => onRestore(index)}
            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1.5 rounded-xl border border-emerald-500/20 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Restore
          </button>
        ) : (
          <button
            onClick={() => onRemove(index)}
            className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors"
            title="Remove from playlist"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

export default TrackRow;
