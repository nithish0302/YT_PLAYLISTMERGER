export interface Account {
  id: string;
  email: string;
  name: string;
  picture?: string;
  status?: 'connected' | 'expired';
  isActive?: boolean;
  token_expiry?: number;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  itemCount: number;
  channelTitle: string;
  sourceAccountId?: string;
  sourceAccountEmail?: string;
  sourceType: 'account' | 'url';
  sourceUrl?: string;
}

export interface Track {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail: string;
  position: number;
  playlistId: string;
  playlistTitle?: string;
  isDuplicate?: boolean;
  duplicateType?: 'exact' | 'possible';
  isRemoved?: boolean;
  keepVersion?: boolean;
}

export interface DuplicateGroup {
  key: string;
  type: 'exact' | 'possible';
  normalizedTitle: string;
  normalizedArtist: string;
  tracks: Track[];
  keepIndex: number;
}

export interface DuplicateStats {
  totalImported: number;
  uniqueTracks: number;
  exactDuplicates: number;
  possibleDuplicates: number;
  afterCleanup: number;
}

export type ViewSection =
  | 'accounts'
  | 'import'
  | 'selected'
  | 'duplicates'
  | 'editor'
  | 'export';

export interface CreatePlaylistResult {
  success: boolean;
  playlistId: string;
  url: string;
  youtubeUrl?: string;
  added: number;
  failed: number;
  total: number;
  failedTracks?: Array<{ videoId: string; reason: string }>;
  error?: string;
}
