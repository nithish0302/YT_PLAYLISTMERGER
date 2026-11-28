import React from 'react';
import {
  X,
  FileArchive,
  Music,
  FileText,
  Image,
  FileCode,
  ShieldCheck,
  AlertTriangle,
  Download,
  ExternalLink,
} from 'lucide-react';
import { getExportZipUrl } from '../../api';

export const ExportModal = ({
  activeJobId,
  stats = {},
  onClose,
}) => {
  if (!activeJobId) return null;

  const {
    totalTracks = 0,
    downloadedSuccessfully = 0,
    lyricsAvailable = 0,
    unavailableTracks = 0,
    failedDownloads = 0,
    snapshotVersion = 'Standard',
  } = stats;

  const exportUrl = getExportZipUrl(activeJobId);

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div>
            <div className="flex items-center gap-2">
              <FileArchive className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Library Packaging & ZIP Export
              </span>
            </div>
            <h3 className="font-bold text-white text-base mt-1">
              Export Verified Music Library
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Snapshot: <span className="font-mono text-purple-300">{snapshotVersion}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {/* Manifest Breakdown */}
          <div className="space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 block">
              Package Contents
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-2.5">
                <Music className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <span className="text-white font-bold block">{downloadedSuccessfully} Audio Files</span>
                  <span className="text-[10px] text-slate-500">FLAC, MP3 & OGG tagged</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <span className="text-white font-bold block">{lyricsAvailable} Lyrics Files</span>
                  <span className="text-[10px] text-slate-500">.lrc synced & .txt plain</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-2.5">
                <Image className="w-4 h-4 text-pink-400 shrink-0" />
                <div>
                  <span className="text-white font-bold block">Embedded Cover Art</span>
                  <span className="text-[10px] text-slate-500">ID3 & Vorbis cover.jpg</span>
                </div>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-2.5">
                <FileCode className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="text-white font-bold block">Manifest & M3U8</span>
                  <span className="text-[10px] text-slate-500">manifest.json & playlist.m3u8</span>
                </div>
              </div>
            </div>
          </div>

          {/* Directory Hierarchy Preview */}
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 font-mono text-[11px]">
            <span className="text-purple-400 font-bold block select-none">ZIP Folder Hierarchy:</span>
            <div className="text-slate-300 space-y-0.5 pl-2 border-l border-slate-800">
              <div>📁 Music/</div>
              <div className="pl-4">📁 Artist Name/</div>
              <div className="pl-8">📁 Album Name/</div>
              <div className="pl-12 text-emerald-400">🎵 01 - Track Title.flac</div>
              <div className="pl-12 text-blue-400">📝 01 - Track Title.lrc</div>
              <div className="pl-12 text-pink-400">🖼️ cover.jpg</div>
              <div>📄 playlist.m3u8</div>
              <div>📄 manifest.json</div>
              <div>📄 track_status_report.json</div>
              <div>📄 metadata_summary.json</div>
            </div>
          </div>

          {/* Compliance Assurance Box */}
          <div className="p-3.5 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl text-[11px] text-emerald-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">Copyright Compliance Guaranteed</span>
              <p className="text-slate-400 text-[10px] leading-relaxed">
                Only verified, legally authorized audio files from open licenses are packaged. Rejected, commercial pop claims, and unverified candidates are strictly excluded.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/40">
          <button
            onClick={onClose}
            className="text-xs font-semibold px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors"
          >
            Cancel
          </button>

          <a
            href={exportUrl}
            download
            className="inline-flex items-center gap-2 text-xs font-bold px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-600/30 transition-all hover:scale-105"
          >
            <Download className="w-4 h-4" />
            <span>Download Verified ZIP</span>
          </a>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
