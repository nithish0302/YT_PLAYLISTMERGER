import React from 'react';
import {
  Users,
  Download,
  ListMusic,
  Copy,
  SlidersHorizontal,
  UploadCloud,
  HardDriveDownload,
  Music2,
  Sparkles,
  Scan,
} from 'lucide-react';

export const Sidebar = ({
  currentSection,
  onSelectSection,
  selectedCount,
  duplicateCount,
  trackCount,
  accountCount,
}) => {
  const navItems = [
    {
      id: 'accounts',
      label: 'Connect Accounts',
      icon: Users,
      badge: accountCount > 0 ? `${accountCount}` : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    },
    {
      id: 'import',
      label: 'Import Playlists',
      icon: Download,
    },
    {
      id: 'selected',
      label: 'Selected Playlists',
      icon: ListMusic,
      badge: `${selectedCount}/7`,
      badgeColor: selectedCount > 0 ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-slate-800 text-slate-400',
    },
    {
      id: 'duplicates',
      label: 'Duplicate Manager',
      icon: Copy,
      badge: duplicateCount > 0 ? `${duplicateCount} dupes` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    },
    {
      id: 'editor',
      label: 'Combined Playlist',
      icon: SlidersHorizontal,
      badge: trackCount > 0 ? `${trackCount} songs` : undefined,
      badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    },
    {
      id: 'export',
      label: 'Export to YouTube',
      icon: UploadCloud,
    },
    {
      id: 'downloads',
      label: 'Download Manager',
      icon: HardDriveDownload,
      badge: 'FLAC+LRC',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
    },
    {
      id: 'coverage',
      label: 'Coverage Analysis',
      icon: Scan,
      badge: 'Scan',
      badgeColor: 'bg-teal-500/20 text-teal-300 border border-teal-500/30',
    },
  ];

  return (
    <aside className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-600/30">
          <Music2 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-base text-white tracking-tight flex items-center gap-1.5">
            Playlist Centralizer
          </h1>
          <p className="text-xs text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-400" />
            YouTube Music Suite
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-4 flex-1 space-y-1.5 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Workflow
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-purple-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                    isActive ? 'bg-white/20 text-white' : item.badgeColor
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quick Summary Pill at bottom */}
      <div className="p-4 m-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 space-y-1.5">
        <div className="flex justify-between items-center text-slate-300 font-medium">
          <span>Active Session</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <div className="flex justify-between text-[11px]">
          <span>Accounts Connected:</span>
          <span className="font-semibold text-slate-200">{accountCount}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span>Playlists Staged:</span>
          <span className="font-semibold text-slate-200">{selectedCount} / 7</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
