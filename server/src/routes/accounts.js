const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const { getAllAccounts, getAccount, deleteAccount, updateTokens } = require('../db');

const router = express.Router();

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
  return new OAuth2Client(getClientId(), getClientSecret(), getRedirectUri());
}

// ── GET /api/accounts ─────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const rawAccounts = await getAllAccounts();
    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;

    const accounts = rawAccounts.map((a) => {
      const isExpired = !a.token_expiry || now > a.token_expiry - fiveMin;
      return {
        id: a.id,
        email: a.email,
        name: a.name || a.email.split('@')[0],
        picture: a.picture || '',
        status: isExpired ? 'expired' : 'connected',
        isActive: !isExpired,
        token_expiry: a.token_expiry,
      };
    });

    res.json({ accounts });
  } catch (err) {
    console.error('[Accounts] list error:', err);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

// ── GET /api/accounts/:id/status ─────────────────────────────────────────────
router.get('/:id/status', async (req, res) => {
  try {
    const account = await getAccount(req.params.id);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const now = Date.now();
    const fiveMin = 5 * 60 * 1000;
    const isExpired = !account.token_expiry || now > account.token_expiry - fiveMin;

    if (!isExpired) {
      return res.json({
        id:           account.id,
        email:        account.email,
        name:         account.name,
        picture:      account.picture,
        status:       'connected',
        valid:        true,
        token_expiry: account.token_expiry,
      });
    }

    if (!account.refresh_token) {
      return res.json({
        id:     account.id,
        email:  account.email,
        status: 'expired',
        valid:  false,
        error:  'No refresh token available – please reconnect this account',
      });
    }

    try {
      const client = createOAuthClient();
      client.setCredentials({ refresh_token: account.refresh_token });
      const { credentials } = await client.refreshAccessToken();

      await updateTokens(
        account.id,
        credentials.access_token,
        credentials.refresh_token || account.refresh_token,
        credentials.expiry_date
      );

      console.log(`[Accounts] Token auto-refreshed for: ${account.email}`);

      return res.json({
        id:           account.id,
        email:        account.email,
        name:         account.name,
        picture:      account.picture,
        status:       'connected',
        valid:        true,
        token_expiry: credentials.expiry_date,
      });
    } catch (refreshErr) {
      console.error('[Accounts] refresh failed:', refreshErr.message);
      return res.json({
        id:     account.id,
        email:  account.email,
        status: 'expired',
        valid:  false,
        error:  'Token refresh failed – please reconnect this account',
      });
    }
  } catch (err) {
    console.error('[Accounts] status error:', err);
    res.status(500).json({ error: 'Failed to check account status' });
  }
});

// ── DELETE /api/accounts/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteAccount(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Account not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Accounts] delete error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
