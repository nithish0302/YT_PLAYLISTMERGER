import React from 'react';
import { Plus, Check, Music2, ExternalLink, User } from 'lucide-react';
import type { Playlist } from '../../types';

interface PlaylistCardProps {
  playlist: Playlist;
  isSelected: boolean;
  onSelect: (playlist: Playlist) => void;
  onDeselect: (playlistId: string) => void;
  disabled?: boolean;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  isSelected,
  onSelect,
  onDeselect,
  disabled,
}) => {
  const [imgError, setImgError] = React.useState(false);

  return (
    <div
      className={`relative bg-slate-900 border rounded-2xl overflow-hidden flex flex-col justify-between transition-all group ${
        isSelected
          ? 'border-purple-500 shadow-xl shadow-purple-600/10 ring-1 ring-purple-500/50'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
        {playlist.thumbnail && !imgError ? (
          <img
            src={playlist.thumbnail}
            alt={playlist.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 gap-1 bg-slate-900">
            <Music2 className="w-8 h-8 text-slate-500" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">No Cover</span>
          </div>
        )}

        {/* Source badge */}
        <div className="absolute top-2.5 left-2.5">
          {playlist.sourceType === 'account' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-900/90 backdrop-blur text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full shadow">
              <User className="w-2.5 h-2.5" />
              {playlist.sourceAccountEmail ? playlist.sourceAccountEmail.split('@')[0] : 'Account'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-900/90 backdrop-blur text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full shadow">
              <ExternalLink className="w-2.5 h-2.5" />
              URL Link
            </span>
          )}
        </div>

        {/* Track count badge */}
        <div className="absolute bottom-2.5 right-2.5 bg-slate-950/80 backdrop-blur text-white text-[11px] font-mono px-2 py-0.5 rounded-lg border border-slate-700/50">
          {playlist.itemCount ?? '?'} tracks
        </div>
      </div>

      {/* Details */}
      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <h4 className="font-semibold text-white text-sm line-clamp-1 group-hover:text-purple-300 transition-colors" title={playlist.title}>
            {playlist.title}
          </h4>
          <p className="text-xs text-slate-400 truncate mt-0.5">
            By {playlist.channelTitle || 'Unknown Creator'}
          </p>
        </div>

        {/* Select / Deselect Button */}
        <div>
          {isSelected ? (
            <button
              onClick={() => onDeselect(playlist.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl py-2 transition-all"
            >
              <Check className="w-3.5 h-3.5 text-purple-400" />
              Selected
            </button>
          ) : (
            <button
              onClick={() => onSelect(playlist)}
              disabled={disabled}
              className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-purple-600 hover:text-white disabled:opacity-40 disabled:hover:bg-slate-800 disabled:hover:text-slate-400 text-slate-200 border border-slate-700/80 hover:border-purple-500 rounded-xl py-2 transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add to Collection
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
export default PlaylistCard;
