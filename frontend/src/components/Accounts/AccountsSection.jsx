import React, { useState } from 'react';
import { Plus, Users, ShieldAlert, KeyRound, Sparkles, AlertCircle } from 'lucide-react';
import AccountCard from './AccountCard.jsx';
import { getAuthUrl, connectAccount, disconnectAccount, reconnectAccount } from '../../api';

export const AccountsSection = ({
  accounts,
  onAccountsUpdated,
  onProceedToImport,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const handleAddAccount = async () => {
    setConnecting(true);
    setError(null);
    try {
      const url = await getAuthUrl();
      // Try opening as OAuth popup
      const width = 500;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        url,
        'Connect Google Account',
        `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no`
      );

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        // Fallback: direct window redirect if popups blocked
        connectAccount();
        return;
      }

      // Listen for message from popup
      const messageListener = async (event) => {
        if (event.data?.type === 'OAUTH_SUCCESS') {
          window.removeEventListener('message', messageListener);
          await onAccountsUpdated();
          setConnecting(false);
        } else if (event.data?.type === 'OAUTH_ERROR') {
          window.removeEventListener('message', messageListener);
          setError(event.data.error || 'Failed to authenticate Google account.');
          setConnecting(false);
        }
      };
      window.addEventListener('message', messageListener);

      // Poll in case user closes popup manually
      const checkTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkTimer);
          window.removeEventListener('message', messageListener);
          setConnecting(false);
          onAccountsUpdated();
        }
      }, 1000);
    } catch (err) {
      console.warn('OAuth URL fetch failed, falling back to direct redirect:', err);
      // Fallback
      connectAccount();
    }
  };

  const handleReconnect = async (id) => {
    const result = await reconnectAccount(id);
    if (!result.valid) {
      // Re-trigger OAuth flow
      handleAddAccount();
    } else {
      await onAccountsUpdated();
    }
  };

  const handleRemove = async (id) => {
    try {
      await disconnectAccount(id);
      await onAccountsUpdated();
    } catch (err) {
      setError(err.message || 'Failed to disconnect account');
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fadeIn">
      {/* Top action row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900/60 border border-slate-800 p-6 rounded-2xl backdrop-blur">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-400" />
            Connected Google Accounts
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Connect as many Google accounts as needed. Tokens are encrypted locally; your passwords are never handled.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleAddAccount}
            disabled={connecting}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-60 text-white font-semibold text-sm rounded-xl px-5 py-2.5 shadow-lg shadow-purple-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            {connecting ? 'Connecting…' : '+ Add Google Account'}
          </button>

          {accounts.length > 0 && (
            <button
              onClick={onProceedToImport}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm rounded-xl px-4 py-2.5 transition-colors border border-slate-700"
            >
              Continue to Import →
            </button>
          )}
        </div>
      </div>

      {/* Error alert banner */}
      {error && (
        <div className="flex items-center justify-between gap-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-200 text-xs font-semibold px-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Accounts list or empty state */}
      {accounts.length === 0 ? (
        <div className="border border-dashed border-slate-800 rounded-3xl p-12 flex flex-col items-center justify-center text-center bg-slate-900/30">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
            <KeyRound className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Google Accounts Connected Yet</h3>
          <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
            Connect at least one Google account to fetch your YouTube Music playlists and save your centralized playlist. You can also import playlists directly via URLs!
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleAddAccount}
              disabled={connecting}
              className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-sm rounded-xl px-6 py-3 shadow-lg shadow-purple-600/30 transition-all hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              {connecting ? 'Connecting…' : 'Connect First Google Account'}
            </button>
            <button
              onClick={onProceedToImport}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm rounded-xl px-6 py-3 border border-slate-700 transition-colors"
            >
              Import via Playlist URL Instead
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Connected Accounts ({accounts.length})
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-purple-400" />
              Select any of these accounts as source or destination
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <AccountCard
                key={acc.id}
                account={acc}
                onReconnect={handleReconnect}
                onRemove={handleRemove}
              />
            ))}
          </div>
        </div>
      )}

      {/* Info card on Google Cloud Setup */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 text-xs text-slate-400 space-y-2">
        <h4 className="font-semibold text-slate-300 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-purple-400" />
          Google Cloud Console Setup Note
        </h4>
        <p className="leading-relaxed">
          To authenticate via Google OAuth 2.0, configure your OAuth Client ID in <code className="text-purple-300 bg-slate-950 px-1 py-0.5 rounded">server/.env</code>. Set redirect URI to <code className="text-purple-300 bg-slate-950 px-1 py-0.5 rounded">http://localhost:3001/auth/callback</code> and enable the <strong className="text-slate-200">YouTube Data API v3</strong> in your Google Cloud Console.
        </p>
      </div>
    </div>
  );
};

export default AccountsSection;
