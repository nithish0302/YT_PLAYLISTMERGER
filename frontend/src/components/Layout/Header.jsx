import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const sectionTitles = {
  accounts: {
    title: 'Google Accounts',
    subtitle: 'Connect multiple YouTube Music or Google accounts without passwords.',
  },
  import: {
    title: 'Import Playlists',
    subtitle: 'Fetch from connected accounts or paste any YouTube / YouTube Music playlist URL.',
  },
  selected: {
    title: 'Selected Playlists Collection',
    subtitle: 'Stage up to 7 playlists from any source and combine them into one dataset.',
  },
  duplicates: {
    title: 'Duplicate Manager',
    subtitle: 'Detect exact video ID matches and song-name/artist duplicates before exporting.',
  },
  editor: {
    title: 'Combined Playlist Editor',
    subtitle: 'Review, search, reorder, and tweak your playlist before publishing.',
  },
  export: {
    title: 'Export / Create Playlist',
    subtitle: 'Choose destination Google account and publish your centralized playlist.',
  },
  downloads: {
    title: 'Playlist Download Manager',
    subtitle: 'Authorized multi-provider audio downloads, LRCLIB synchronized lyrics, and verified ZIP exports.',
  },
};

export const Header = ({
  currentSection,
  selectedCount,
  totalTracks,
  accountCount,
}) => {
  const current = sectionTitles[currentSection] || sectionTitles.accounts;

  return (
    <header className="h-20 bg-slate-900/60 backdrop-blur border-b border-slate-800 px-8 flex items-center justify-between shrink-0">
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">{current.title}</h2>
        <p className="text-xs text-slate-400">{current.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Playlists staged pill */}
        <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3.5 py-1.5 rounded-xl text-xs">
          <span className="text-slate-400">Playlists:</span>
          <span className={`font-semibold font-mono ${selectedCount > 0 ? 'text-purple-400' : 'text-slate-400'}`}>
            {selectedCount} / 7
          </span>
        </div>

        {/* Tracks pill */}
        {totalTracks > 0 && (
          <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-3.5 py-1.5 rounded-xl text-xs">
            <span className="text-slate-400">Total Songs:</span>
            <span className="font-semibold font-mono text-emerald-400">{totalTracks}</span>
          </div>
        )}

        {/* Google Status */}
        <div className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl text-xs">
          {accountCount > 0 ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">{accountCount} Active</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-400 font-medium">No Accounts</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
