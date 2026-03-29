// utils/helpers.js
const fs      = require('fs-extra');
const path    = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const OUTPUT_DIR = process.env.OUTPUT_DIR || './outputs';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
fs.ensureDirSync(OUTPUT_DIR);

/* ── Clean up session folders ─────────────────────────────────── */
async function cleanupSession(uploadId) {
  try {
    await fs.remove(path.join(UPLOAD_DIR, uploadId));
    await fs.remove(path.join(OUTPUT_DIR, uploadId));
  } catch (_) { /* ignore */ }
}

/* ── Schedule cleanup of old files ───────────────────────────── */
async function cleanOldFiles(ttlMinutes = 120) {
  const cutoff = Date.now() - ttlMinutes * 60 * 1000;
  for (const dir of [UPLOAD_DIR, OUTPUT_DIR]) {
    const entries = await fs.readdir(dir).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = await fs.stat(full).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) {
        await fs.remove(full).catch(() => {});
      }
    }
  }
}

/* ── Prepare output directory ─────────────────────────────────── */
async function prepareOutput(uploadId) {
  const dir = path.join(OUTPUT_DIR, uploadId);
  await fs.ensureDir(dir);
  return dir;
}

/* ── Check if a CLI tool is available ─────────────────────────── */
const toolCache = {};
async function cliAvailable(cmd) {
  if (toolCache[cmd] !== undefined) return toolCache[cmd];
  try {
    await execAsync(`which ${cmd}`);
    toolCache[cmd] = true;
  } catch {
    toolCache[cmd] = false;
  }
  return toolCache[cmd];
}

/* ── Run shell command with timeout ──────────────────────────── */
async function runCmd(cmd, timeoutMs = 60000) {
  return execAsync(cmd, { timeout: timeoutMs });
}

/* ── Standard success response ───────────────────────────────── */
function sendFile(res, filePath, downloadName) {
  res.download(filePath, downloadName, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to send file' });
    }
  });
}

/* ── Standard error response ─────────────────────────────────── */
function sendError(res, message, status = 500) {
  console.error('[PDFLove Error]', message);
  if (!res.headersSent) {
    res.status(status).json({ error: message });
  }
}

/* ── Format bytes ─────────────────────────────────────────────── */
function formatBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

/* ── Validate pages param  "1,3,5-8" → [1,3,5,6,7,8] ─────────── */
function parsePageRanges(str, totalPages) {
  const pages = new Set();
  const parts = String(str || '').split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed.includes('-')) {
      const [a, b] = trimmed.split('-').map(Number);
      for (let i = a; i <= Math.min(b, totalPages); i++) pages.add(i);
    } else {
      const n = Number(trimmed);
      if (n >= 1 && n <= totalPages) pages.add(n);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

module.exports = {
  cleanupSession,
  cleanOldFiles,
  prepareOutput,
  cliAvailable,
  runCmd,
  sendFile,
  sendError,
  formatBytes,
  parsePageRanges,
  OUTPUT_DIR,
  UPLOAD_DIR,
};
