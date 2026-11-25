const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { saveAccount, getAccount, getAllAccounts, deleteAccount, updateTokens } = require('../db');

const router = express.Router();

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube',
];

function getClientId() {
  return process.env.CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
}

function getClientSecret() {
  return process.env.CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
}

function getRedirectUri() {
  return process.env.REDIRECT_URI || 'http://localhost:3001/auth/callback';
}

function createOAuthClient() {
  return new OAuth2Client(
    getClientId(),
    getClientSecret(),
    getRedirectUri()
  );
}

// ── GET /auth/url or /api/auth/google/url (JSON for popups) ─────────────────────
function generateAuthUrlHandler(req, res) {
  const { accountHint } = req.query;
  const client = createOAuthClient();

  const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
  if (req.session) {
    req.session.oauthState = state;
  }

  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent',
    scope: SCOPES,
    state,
    ...(accountHint ? { login_hint: accountHint } : {}),
  });

  res.json({ url, state });
}

router.get('/url', generateAuthUrlHandler);

// ── GET /auth/connect (Browser direct redirect) ───────────────────────────────
router.get('/connect', (req, res) => {
  const { accountHint } = req.query;
  const client = createOAuthClient();

  const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
  if (req.session) {
    req.session.oauthState = state;
  }

  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent',
    scope: SCOPES,
    state,
    ...(accountHint ? { login_hint: accountHint } : {}),
  });

  res.redirect(url);
});

// ── GET /auth/callback ────────────────────────────────────────────────────────
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;

  const returnHtml = (success, data) => {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Authentication</title>
          <style>
            body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .card { background: #1e293b; padding: 2rem; border-radius: 1rem; border: 1px solid #334155; text-align: center; max-width: 400px; }
            h2 { color: ${success ? '#4ade80' : '#f87171'}; margin-top: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>${success ? '✓ Account Connected!' : '✕ Authentication Failed'}</h2>
            <p>${success ? `Successfully connected <strong>${data.email || 'account'}</strong>.` : (data.error || 'Unknown error occurred.')}</p>
            <p style="color: #94a3b8; font-size: 0.85rem;">This window will close automatically...</p>
          </div>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({
                  type: ${JSON.stringify(success ? 'OAUTH_SUCCESS' : 'OAUTH_ERROR')},
                  ${success ? `email: ${JSON.stringify(data.email || '')}` : `error: ${JSON.stringify(data.error || '')}`}
                }, '*');
                setTimeout(() => window.close(), 1500);
              } else {
                setTimeout(() => {
                  window.location.href = 'http://localhost:3000?connected=${success}&email=${encodeURIComponent(data.email || '')}&error=${encodeURIComponent(data.error || '')}';
                }, 1500);
              }
            } catch (e) {
              window.location.href = 'http://localhost:3000?connected=${success}&email=${encodeURIComponent(data.email || '')}';
            }
          </script>
        </body>
      </html>
    `);
  };

  if (error) {
    console.error('[Auth] OAuth error:', error);
    return returnHtml(false, { error });
  }

  if (!code) {
    return returnHtml(false, { error: 'No authorization code received' });
  }

  try {
    const client = createOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    let payload = null;
    if (tokens.id_token) {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: getClientId(),
      });
      payload = ticket.getPayload();
    } else {
      // Fallback: fetch userinfo from Google API
      const oauth2 = require('googleapis').google.oauth2({ version: 'v2', auth: client });
      const userinfo = await oauth2.userinfo.get();
      payload = {
        sub: userinfo.data.id,
        email: userinfo.data.email,
        name: userinfo.data.name,
        picture: userinfo.data.picture,
      };
    }

    const accountData = {
      id:            payload.sub,
      email:         payload.email,
      name:          payload.name || payload.email.split('@')[0],
      picture:       payload.picture || '',
      access_token:  tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry:  tokens.expiry_date,
    };

    await saveAccount(accountData);
    console.log(`[Auth] Account connected successfully: ${accountData.email}`);

    return returnHtml(true, { email: accountData.email });
  } catch (err) {
    console.error('[Auth] Callback error:', err);
    return returnHtml(false, { error: err.message });
  }
});

// ── GET /auth/accounts ────────────────────────────────────────────────────────
router.get('/accounts', async (_req, res) => {
  try {
    const accounts = await getAllAccounts();
    res.json({ accounts });
  } catch (err) {
    console.error('[Auth] getAllAccounts error:', err);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

// ── DELETE /auth/accounts/:id ─────────────────────────────────────────────────
router.delete('/accounts/:id', async (req, res) => {
  try {
    const deleted = await deleteAccount(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Account not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Auth] deleteAccount error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ── POST /auth/refresh/:id ────────────────────────────────────────────────────
router.post('/refresh/:id', async (req, res) => {
  try {
    const account = await getAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    if (!account.refresh_token) return res.status(400).json({ error: 'No refresh token stored' });

    const client = createOAuthClient();
    client.setCredentials({ refresh_token: account.refresh_token });

    const { credentials } = await client.refreshAccessToken();

    await updateTokens(
      account.id,
      credentials.access_token,
      credentials.refresh_token || account.refresh_token,
      credentials.expiry_date
    );

    console.log(`[Auth] Token refreshed for: ${account.email}`);
    res.json({ success: true, expiry: credentials.expiry_date });
  } catch (err) {
    console.error('[Auth] refresh error:', err);
    res.status(500).json({ error: 'Token refresh failed: ' + err.message });
  }
});

module.exports = router;
