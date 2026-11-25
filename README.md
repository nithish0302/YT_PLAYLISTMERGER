# 🎵 Playlist Centralizer - YouTube Music Suite

A modern, local-first web application designed to collect playlists from multiple YouTube / YouTube Music accounts or playlist URLs, combine them into one seamless collection, detect & remove duplicate tracks, and export the centralized playlist to any chosen Google account.

---

## 🚀 Quick Start

### 1. Start Both Services with One Click
Double click the `start.bat` file in `d:\YT PLAYLIST` or run:
```powershell
.\start.bat
```
- **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000)
- **Backend API:** [http://localhost:3001](http://localhost:3001)

Or start manually:
```powershell
# Terminal 1 - Backend
cd "d:\YT PLAYLIST\server"
npm start

# Terminal 2 - Frontend
cd "d:\YT PLAYLIST\client"
npm start
```

---

## 🔑 Google Cloud Console Configuration (YouTube Data API v3)

To connect Google accounts and create playlists on YouTube Music:

1. Visit [Google Cloud Console](https://console.cloud.google.com).
2. Create a new project (e.g. `Playlist-Centralizer`).
3. Navigate to **APIs & Services > Library**, search for **YouTube Data API v3**, and click **Enable**.
4. Go to **APIs & Services > OAuth consent screen**:
   - Select **External** user type.
   - Fill in an App name and support email.
   - Add the scopes:
     - `https://www.googleapis.com/auth/youtube`
     - `openid`
     - `email`
     - `profile`
   - Add your Google account email under **Test Users**.
5. Go to **APIs & Services > Credentials**:
   - Click **+ Create Credentials > OAuth client ID**.
   - Application type: **Web application**.
   - Name: `Playlist Centralizer Web`.
   - **Authorized redirect URIs**: Add `http://localhost:3001/auth/callback`.
   - Click **Create**.
6. Copy your **Client ID** and **Client Secret** into `d:\YT PLAYLIST\server\.env`:
   ```env
   GOOGLE_CLIENT_ID=your_id_here.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_secret_here
   REDIRECT_URI=http://localhost:3001/auth/callback
   SESSION_SECRET=a_random_secure_secret_string
   ENCRYPTION_KEY=a_random_32_char_aes_encryption_key
   ```

---

## ✨ Features

- **Multi-Account Connect:** Connect multiple Google accounts simultaneously with OAuth 2.0 without ever exposing passwords. Tokens are AES-encrypted locally in SQLite.
- **Two Import Methods:**
  - **Method A:** Direct fetch of user's personal playlists from any connected account.
  - **Method B:** Paste any YouTube or YouTube Music playlist link (`music.youtube.com` or `youtube.com`). Public, unlisted, and private (via authorization) are supported.
- **Stage up to 7 Playlists:** Combine any combination of playlists across accounts and links into one staging dataset.
- **Advanced Duplicate Detection:**
  - **Mode 1 (Exact Duplicates):** Matches identical YouTube Video IDs; keeps one copy and flags the rest.
  - **Mode 2 (Song-Name Duplicates):** Normalizes song titles and artist names (stripping `[Official Video]`, `(Visualizer)`, `feat.`, etc.) to find matching uploads with human review approval.
  - Select which upload version to keep using intuitive radio cards.
- **Final Playlist Editor:**
  - Custom playlist name (default: "My Combined Playlist") & description.
  - Drag-and-drop reordering with `@hello-pangea/dnd`.
  - Instant live search & filtering.
  - Individual song removal and instant restoration.
- **Destination Google Account Selection:**
  - Pick any connected account independently to receive the final playlist.
  - Add a brand new Google account directly from the export screen.
- **Direct YouTube Music Export:**
  - Creates the playlist with `Private` visibility by default.
  - Inserts all songs with rate limiting and quota handling.
  - Provides direct one-click link to open in YouTube Music.
