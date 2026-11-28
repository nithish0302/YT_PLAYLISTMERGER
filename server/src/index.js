require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');

const { initDB } = require('./db');
const authRoutes = require('./routes/auth');
const playlistRoutes = require('./routes/playlists');
const accountRoutes = require('./routes/accounts');
const downloadRoutes = require('./routes/downloads');
const coverageRoutes = require('./routes/coverage');
const libraryRoutes = require('./routes/library');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || 'playlist-centralizer-secret-change-me',
  resave: false,
  saveUninitialized: false,
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: path.join(__dirname, '..'),
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// ── Routes ────────────────────────────────────────────────────────────────────

app.use('/auth', authRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/coverage', coverageRoutes);
app.use('/api/library', libraryRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 404 fallback
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler (never leaks stack traces or file paths to client)
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Server Error]', err.message);
  const status = err.statusCode || err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  try {
    await initDB();
    console.log('[DB] Database initialised');

    app.listen(PORT, () => {
      console.log(`[Server] Listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[Bootstrap] Fatal error:', err);
    process.exit(1);
  }
}

bootstrap();
