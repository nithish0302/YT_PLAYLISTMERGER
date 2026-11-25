import React, { useState } from 'react';
import { UserCircle2, CheckCircle2, AlertCircle, RefreshCw, Trash2, ShieldCheck, Mail } from 'lucide-react';

export const AccountCard = ({ account, onReconnect, onRemove }) => {
  const [imgError, setImgError] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const isExpired = account.status === 'expired' || account.isActive === false;

  const handleConfirmRemove = async () => {
    setRemoving(true);
    try {
      await onRemove(account.id);
    } finally {
      setRemoving(false);
      setShowConfirm(false);
    }
  };

  const handleReconnectClick = async () => {
    setReconnecting(true);
    try {
      await onReconnect(account.id);
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-xl hover:border-slate-700 transition-all group">
      <div>
        {/* Top bar with Avatar and Status */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              {account.picture && !imgError ? (
                <img
                  src={account.picture}
                  alt={account.name}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-purple-500/30"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center ring-2 ring-slate-700">
                  <UserCircle2 className="w-8 h-8 text-slate-400" />
                </div>
              )}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${
                  isExpired ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </div>

            <div className="min-w-0">
              <h3 className="font-semibold text-white text-sm truncate">{account.name}</h3>
              <p className="text-xs text-slate-400 truncate flex items-center gap-1 mt-0.5">
                <Mail className="w-3 h-3 shrink-0" />
                {account.email}
              </p>
            </div>
          </div>

          {/* Status badge */}
          {isExpired ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2.5 py-0.5 shrink-0">
              <AlertCircle className="w-3 h-3" />
              Expired
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-0.5 shrink-0">
              <CheckCircle2 className="w-3 h-3" />
              Active
            </span>
          )}
        </div>

        {/* Security badge note */}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-950/40 rounded-lg px-2.5 py-1.5 mb-4">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>OAuth 2.0 encrypted token on local backend</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
        {isExpired && (
          <button
            onClick={handleReconnectClick}
            disabled={reconnecting}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl py-2 transition-all shadow-md shadow-purple-600/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconnecting ? 'animate-spin' : ''}`} />
            {reconnecting ? 'Refreshing…' : 'Reconnect'}
          </button>
        )}
        <button
          onClick={() => setShowConfirm(true)}
          disabled={removing}
          className={`inline-flex items-center justify-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl py-2 px-3 transition-colors ${
            isExpired ? '' : 'flex-1'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          {removing ? 'Removing…' : 'Disconnect'}
        </button>
      </div>

      {/* Confirmation modal overlay */}
      {showConfirm && (
        <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-sm rounded-2xl p-5 flex flex-col justify-center items-center text-center z-20 animate-fadeIn">
          <h4 className="text-sm font-semibold text-white mb-1">Disconnect Account?</h4>
          <p className="text-xs text-slate-400 mb-4 max-w-[200px]">
            Remove <span className="text-purple-400 font-medium">{account.email}</span> and all associated local credentials.
          </p>
          <div className="flex gap-2 w-full">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 text-xs py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmRemove}
              disabled={removing}
              className="flex-1 text-xs py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium transition-colors shadow-lg shadow-rose-600/30"
            >
              {removing ? 'Removing...' : 'Disconnect'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountCard;
