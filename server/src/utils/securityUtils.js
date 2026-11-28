/**
 * Local Security Utilities for YT_PLAYLISTMERGER
 * Implements Task 3: Input validation, filesystem safety, and SSRF defense.
 */

const path = require('path');
const { URL } = require('url');

/**
 * Validates external URLs for audio and artwork downloads to prevent SSRF.
 * Blocks private IP ranges, loopback addresses, link-local, and cloud metadata endpoints.
 */
function validateExternalUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') {
    throw new Error('Invalid URL: URL string is required.');
  }

  let parsed;
  try {
    parsed = new URL(urlString.trim());
  } catch (err) {
    throw new Error(`Malformed URL: ${err.message}`);
  }

  // 1. Enforce allowed protocols
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new Error(`Forbidden protocol "${protocol}": Only HTTP and HTTPS are permitted.`);
  }

  // 2. Reject embedded credentials
  if (parsed.username || parsed.password) {
    throw new Error('Forbidden URL format: URLs with embedded credentials are not allowed.');
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // 3. Block loopback and localhost
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error(`SSRF Protection: Access to localhost or loopback address "${hostname}" is forbidden.`);
  }

  // 4. Block Cloud Metadata IP
  if (hostname === '169.254.169.254') {
    throw new Error('SSRF Protection: Access to cloud metadata service is strictly blocked.');
  }

  // 5. Block private IPv4 ranges (RFC 1918 & RFC 3927)
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octet1 = parseInt(ipv4Match[1], 10);
    const octet2 = parseInt(ipv4Match[2], 10);

    // 10.0.0.0/8
    if (octet1 === 10) {
      throw new Error(`SSRF Protection: Access to private network address "${hostname}" is forbidden.`);
    }

    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) {
      throw new Error(`SSRF Protection: Access to private network address "${hostname}" is forbidden.`);
    }

    // 192.168.0.0/16
    if (octet1 === 192 && octet2 === 168) {
      throw new Error(`SSRF Protection: Access to private network address "${hostname}" is forbidden.`);
    }

    // 169.254.0.0/16 (Link-local)
    if (octet1 === 169 && octet2 === 254) {
      throw new Error(`SSRF Protection: Access to link-local address "${hostname}" is forbidden.`);
    }

    // 127.0.0.0/8
    if (octet1 === 127) {
      throw new Error(`SSRF Protection: Access to loopback address "${hostname}" is forbidden.`);
    }
  }

  return parsed;
}

/**
 * Validates request identifiers (jobId, trackId, scanId) to prevent path traversal or malformed strings.
 */
function validateIdentifier(id, fieldName = 'Identifier') {
  if (!id || typeof id !== 'string') {
    const err = new Error(`${fieldName} is required and must be a string.`);
    err.statusCode = 400;
    throw err;
  }

  const trimmed = id.trim();
  // Safe identifier format: alphanumeric, dashes, underscores, and dots (no slashes or backslashes)
  const safeIdRegex = /^[a-zA-Z0-9_\-\.]{1,128}$/;
  if (!safeIdRegex.test(trimmed) || trimmed.includes('..')) {
    const err = new Error(`Invalid ${fieldName}: Malformed format or path traversal sequence detected.`);
    err.statusCode = 400;
    throw err;
  }

  return trimmed;
}

/**
 * Sanitizes a filename to ensure it cannot escape directories.
 */
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }
  return path.basename(filename)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim();
}

/**
 * Validates that targetPath resides strictly within allowedBaseDir to prevent directory traversal.
 */
function sanitizePath(targetPath, allowedBaseDir) {
  if (!targetPath) {
    throw new Error('Path is required.');
  }

  const normalizedBase = path.resolve(allowedBaseDir).replace(/\\/g, '/').toLowerCase();
  const normalizedTarget = path.resolve(targetPath).replace(/\\/g, '/').toLowerCase();

  if (!normalizedTarget.startsWith(normalizedBase)) {
    const err = new Error(`Path traversal attempt blocked: Path "${targetPath}" is outside allowed directory.`);
    err.statusCode = 403;
    throw err;
  }

  return path.resolve(targetPath);
}

module.exports = {
  validateExternalUrl,
  validateIdentifier,
  sanitizeFilename,
  sanitizePath,
};
