import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import AccountsSection from './components/Accounts/AccountsSection';
import ImportSection from './components/Import/ImportSection';
import SelectedSection from './components/Selected/SelectedSection';
import DuplicatesSection from './components/Duplicates/DuplicatesSection';
import EditorSection from './components/Editor/EditorSection';
import ExportSection from './components/Export/ExportSection';

import type { Account, Playlist, Track, DuplicateGroup, DuplicateStats, ViewSection } from './types';
import { getAccounts, getPlaylistTracks } from './api';
import {
  findExactDuplicates,
  findPossibleDuplicates,
  calculateDuplicateStats,
  removeExactDuplicates,
  removeSelectedPossibleDuplicates,
  restoreAllTracks,
} from './utils/duplicateDetection';

export const App: React.FC = () => {
  // Navigation
  const [currentSection, setCurrentSection] = useState<ViewSection>('accounts');

  // Accounts
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Playlists (up to 7)
  const [selectedPlaylists, setSelectedPlaylists] = useState<Playlist[]>([]);

  // Tracks (Combined dataset)
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [combining, setCombining] = useState(false);
  const [combineProgress, setCombineProgress] = useState('');

  // Duplicates state
  const [exactGroups, setExactGroups] = useState<DuplicateGroup[]>([]);
  const [possibleGroups, setPossibleGroups] = useState<DuplicateGroup[]>([]);

  // Final Playlist Metadata
  const [playlistName, setPlaylistName] = useState('My Combined Playlist');
  const [playlistDescription, setPlaylistDescription] = useState('Centralized playlist created with Playlist Centralizer');

  // ── Fetch Accounts on Load ──
  const refreshAccounts = useCallback(async () => {
    try {
      const accs = await getAccounts();
      setAccounts(accs);
    } catch (err: any) {
      console.warn('Could not fetch accounts:', err);
    }
  }, []);

  useEffect(() => {
    refreshAccounts();

    // Check for redirect back from OAuth
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const email = params.get('email');
    const error = params.get('error');

    if (connected === 'true') {
      toast.success(`Google account ${email ? `(${email})` : ''} connected!`, { duration: 4000 });
      window.history.replaceState({}, document.title, window.location.pathname);
      refreshAccounts();
    } else if (connected === 'false') {
      toast.error(`OAuth error: ${error || 'Authentication canceled'}`, { duration: 5000 });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [refreshAccounts]);

  // ── Duplicate Detection Recalculation ──
  const runDuplicateDetection = useCallback((tracks: Track[]) => {
    const exact = findExactDuplicates(tracks);
    const exactIds = new Set<string>();
    exact.forEach((g) => g.tracks.forEach((t) => exactIds.add(t.videoId)));
    const possible = findPossibleDuplicates(tracks, exactIds);

    setExactGroups(exact);
    setPossibleGroups(possible);
  }, []);

  // Duplicate Stats Memo
  const duplicateStats: DuplicateStats = useMemo(() => {
    return calculateDuplicateStats(allTracks, exactGroups, possibleGroups);
  }, [allTracks, exactGroups, possibleGroups]);

  // ── Playlist Selection Handlers ──
  const handleAddPlaylist = (playlist: Playlist) => {
    if (selectedPlaylists.length >= 7) {
      toast.error('Limit reached: You can stage up to 7 playlists in one merge operation.', {
        icon: '⚠️',
      });
      return;
    }
    if (selectedPlaylists.some((p) => p.id === playlist.id)) {
      toast('Playlist is already in your staged collection.', { icon: 'ℹ️' });
      return;
    }
    setSelectedPlaylists((prev) => [...prev, playlist]);
    toast.success(`Added "${playlist.title}" to collection (${selectedPlaylists.length + 1}/7)`);
  };

  const handleRemovePlaylist = (playlistId: string) => {
    setSelectedPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    toast('Playlist removed from staged collection.');
  };

  // ── Combine Playlists ──
  const handleCombinePlaylists = async () => {
    if (selectedPlaylists.length === 0) {
      toast.error('Please stage at least one playlist before combining.');
      return;
    }

    setCombining(true);
    setCombineProgress('Preparing track fetch...');

    const combined: Track[] = [];

    try {
      for (let i = 0; i < selectedPlaylists.length; i++) {
        const pl = selectedPlaylists[i];
        setCombineProgress(`Importing playlist ${i + 1} of ${selectedPlaylists.length}: "${pl.title}"...`);

        const tracks = await getPlaylistTracks(pl.id, pl.sourceAccountId);
        const enriched = tracks.map((t, idx) => ({
          ...t,
          playlistTitle: pl.title,
          playlistId: pl.id,
          position: idx,
        }));
        combined.push(...enriched);
      }

      setAllTracks(combined);
      runDuplicateDetection(combined);
      toast.success(`Successfully combined ${combined.length} songs from ${selectedPlaylists.length} playlists!`);
      setCurrentSection('duplicates');
    } catch (err: any) {
      console.error('Failed to combine playlist tracks:', err);
      toast.error(`Error loading tracks: ${err.message || 'Unknown error'}`);
    } finally {
      setCombining(false);
      setCombineProgress('');
    }
  };

  // ── Duplicate Actions ──
  const handleFindDuplicates = () => {
    runDuplicateDetection(allTracks);
    toast.success('Duplicate scan refreshed.');
  };

  const handleRemoveExactDuplicates = () => {
    const updated = removeExactDuplicates(allTracks, exactGroups);
    setAllTracks(updated);
    runDuplicateDetection(updated);
    toast.success(`Removed ${duplicateStats.exactDuplicates} exact duplicate songs.`);
  };

  const handleRemoveSelectedDuplicates = (resolvedGroups: DuplicateGroup[]) => {
    const updated = removeSelectedPossibleDuplicates(allTracks, resolvedGroups);
    setAllTracks(updated);
    runDuplicateDetection(updated);
    toast.success(`Removed selected duplicates.`);
  };

  const handleRestoreAllDuplicates = () => {
    const restored = restoreAllTracks(allTracks);
    setAllTracks(restored);
    runDuplicateDetection(restored);
    toast.success('All removed duplicate songs have been restored.');
  };

  const handleUpdateGroupKeepIndex = (
    type: 'exact' | 'possible',
    groupKey: string,
    keepIndex: number
  ) => {
    if (type === 'exact') {
      setExactGroups((prev) =>
        prev.map((g) => (g.key === groupKey ? { ...g, keepIndex } : g))
      );
    } else {
      setPossibleGroups((prev) =>
        prev.map((g) => (g.key === groupKey ? { ...g, keepIndex } : g))
      );
    }
  };

  // ── Editor Actions ──
  const handleReorderTracks = (reordered: Track[]) => {
    setAllTracks(reordered);
  };

  const handleRemoveTrack = (index: number) => {
    setAllTracks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], isRemoved: true };
      return next;
    });
    toast('Song marked as removed.');
  };

  const handleRestoreTrack = (index: number) => {
    setAllTracks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], isRemoved: false };
      return next;
    });
    toast.success('Song restored.');
  };

  const handleRestoreAllEditor = () => {
    const restored = restoreAllTracks(allTracks);
    setAllTracks(restored);
    toast.success('Restored all songs.');
  };

  // ── Reset / Start Over ──
  const handleStartOver = () => {
    setSelectedPlaylists([]);
    setAllTracks([]);
    setExactGroups([]);
    setPossibleGroups([]);
    setPlaylistName('My Combined Playlist');
    setCurrentSection('import');
    toast('Session reset. Ready to stage new playlists!');
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            borderRadius: '0.75rem',
            fontSize: '0.85rem',
          },
        }}
      />

      {/* Modern Sidebar */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={setCurrentSection}
        selectedCount={selectedPlaylists.length}
        duplicateCount={duplicateStats.exactDuplicates + duplicateStats.possibleDuplicates}
        trackCount={duplicateStats.afterCleanup}
        accountCount={accounts.length}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Header
          currentSection={currentSection}
          selectedCount={selectedPlaylists.length}
          totalTracks={duplicateStats.afterCleanup || allTracks.length}
          accountCount={accounts.length}
        />

        <main className="flex-1 overflow-y-auto">
          {currentSection === 'accounts' && (
            <AccountsSection
              accounts={accounts}
              onAccountsUpdated={refreshAccounts}
              onProceedToImport={() => setCurrentSection('import')}
            />
          )}

          {currentSection === 'import' && (
            <ImportSection
              accounts={accounts}
              selectedPlaylists={selectedPlaylists}
              onAddPlaylist={handleAddPlaylist}
              onRemovePlaylist={handleRemovePlaylist}
              onProceedToSelected={() => setCurrentSection('selected')}
            />
          )}

          {currentSection === 'selected' && (
            <SelectedSection
              selectedPlaylists={selectedPlaylists}
              onRemovePlaylist={handleRemovePlaylist}
              onCombinePlaylists={handleCombinePlaylists}
              combining={combining}
              combineProgress={combineProgress}
              onProceedToImport={() => setCurrentSection('import')}
            />
          )}

          {currentSection === 'duplicates' && (
            <DuplicatesSection
              tracks={allTracks}
              exactGroups={exactGroups}
              possibleGroups={possibleGroups}
              stats={duplicateStats}
              onFindDuplicates={handleFindDuplicates}
              onRemoveExactDuplicates={handleRemoveExactDuplicates}
              onRemoveSelectedDuplicates={handleRemoveSelectedDuplicates}
              onRestoreAll={handleRestoreAllDuplicates}
              onUpdateGroupKeepIndex={handleUpdateGroupKeepIndex}
              onProceedToEditor={() => setCurrentSection('editor')}
            />
          )}

          {currentSection === 'editor' && (
            <EditorSection
              tracks={allTracks}
              playlistName={playlistName}
              playlistDescription={playlistDescription}
              onUpdatePlaylistName={setPlaylistName}
              onUpdatePlaylistDescription={setPlaylistDescription}
              onReorderTracks={handleReorderTracks}
              onRemoveTrack={handleRemoveTrack}
              onRestoreTrack={handleRestoreTrack}
              onRestoreAllTracks={handleRestoreAllEditor}
              onProceedToExport={() => setCurrentSection('export')}
            />
          )}

          {currentSection === 'export' && (
            <ExportSection
              accounts={accounts}
              tracks={allTracks}
              playlistName={playlistName}
              playlistDescription={playlistDescription}
              onAccountsUpdated={refreshAccounts}
              onStartOver={handleStartOver}
            />
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
