// server.js  –  PDFLove Backend
require('dotenv').config();

const express      = require('express');
const cors         = require('cors');
const helmet       = require('helmet');
const morgan       = require('morgan');
const path         = require('path');
const fs           = require('fs-extra');
const cron         = require('node-cron');
const rateLimit    = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const organizeRoutes  = require('./routes/organize');
const editRoutes      = require('./routes/edit');
const securityRoutes  = require('./routes/security');
const optimizeRoutes  = require('./routes/optimize');
const convertRoutes   = require('./routes/convert');
const { cleanOldFiles, OUTPUT_DIR, UPLOAD_DIR } = require('./utils/helpers');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Ensure folders exist ─────────────────────────── */
fs.ensureDirSync(UPLOAD_DIR);
fs.ensureDirSync(OUTPUT_DIR);

/* ── Security middleware ──────────────────────────── */
app.use(helmet({
  contentSecurityPolicy: false,   // Disable for local dev
  crossOriginEmbedderPolicy: false,
}));

/* ── CORS ─────────────────────────────────────────── */
const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
app.use(cors({
  origin: true,          // ← allows any origin (fine for now)
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));



/* ── Logging ──────────────────────────────────────── */
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

/* ── Rate limiting ────────────────────────────────── */
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX) || 50,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please try again in a few minutes.' },
  skip: () => process.env.NODE_ENV === 'development',  // skip in dev
});
app.use('/api/', limiter);

/* ── Serve frontend ───────────────────────────────── */
// Serve index.html from the parent folder (or public/ in production)
const frontendPath = path.resolve(__dirname, '../public');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
} else {
  // Also serve from current dir (when index.html is alongside server.js)
  app.use(express.static(path.resolve(__dirname)));
}

/* ══════════════════════════════════════════════════
   API ROUTES
══════════════════════════════════════════════════ */
app.use('/api/organize', organizeRoutes);
app.use('/api/edit',     editRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/optimize', optimizeRoutes);
app.use('/api/convert',  convertRoutes);

/* ── Health check ─────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({
    status:  'ok',
    service: 'PDFLove API',
    version: '1.0.0',
    time:    new Date().toISOString(),
  });
});

/* ── System info ──────────────────────────────────── */
app.get('/api/system', async (req, res) => {
  const { cliAvailable } = require('./utils/helpers');
  const tools = {
    ghostscript:   await cliAvailable('gs'),
    libreoffice:   (await cliAvailable('soffice')) || (await cliAvailable('libreoffice')),
    poppler:       await cliAvailable('pdftoppm'),
    tesseract:     await cliAvailable('tesseract'),
    qpdf:          await cliAvailable('qpdf'),
    imagemagick:   await cliAvailable('convert'),
  };

  const missing = Object.entries(tools)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);

  res.json({
    status:         'ok',
    nodeVersion:    process.version,
    systemTools:    tools,
    missingTools:   missing,
    installHints: {
      ghostscript:  'sudo apt install ghostscript',
      libreoffice:  'sudo apt install libreoffice',
      poppler:      'sudo apt install poppler-utils',
      tesseract:    'sudo apt install tesseract-ocr',
      qpdf:         'sudo apt install qpdf',
      imagemagick:  'sudo apt install imagemagick',
    },
  });
});

/* ── File Download ────────────────────────────────── */
app.get('/api/download/:sessionId/:filename', async (req, res) => {
  try {
    const { sessionId, filename } = req.params;

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || sessionId.includes('..')) {
      return res.status(400).json({ error: 'Invalid path.' });
    }

    const filePath = path.join(OUTPUT_DIR, sessionId, filename);
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'File not found or already deleted.' });
    }

    res.download(filePath, filename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── File info ────────────────────────────────────── */
app.get('/api/info/:sessionId/:filename', async (req, res) => {
  try {
    const { sessionId, filename } = req.params;
    if (filename.includes('..') || sessionId.includes('..'))
      return res.status(400).json({ error: 'Invalid path.' });

    const filePath = path.join(OUTPUT_DIR, sessionId, filename);
    if (!await fs.pathExists(filePath)) return res.status(404).json({ error: 'File not found.' });

    const stat = await fs.stat(filePath);
    const { PDFDocument } = require('pdf-lib');
    let pages = null;

    if (filename.endsWith('.pdf')) {
      try {
        const bytes = await fs.readFile(filePath);
        const pdf   = await PDFDocument.load(bytes, { ignoreEncryption: true });
        pages = pdf.getPageCount();
      } catch {}
    }

    res.json({ filename, size: stat.size, pages, created: stat.birthtime });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── 404 handler ──────────────────────────────────── */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `API route ${req.path} not found.` });
  }
  // For non-API 404s, serve index.html (SPA fallback)
  const idx = path.resolve(__dirname, '../public/index.html');
  if (fs.existsSync(idx)) res.sendFile(idx);
  else res.status(404).send('Not found');
});

/* ── Global error handler ─────────────────────────── */
app.use((err, req, res, _next) => {
  console.error('[PDFLove]', err.stack || err.message);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large. Maximum 200 MB.' });
  }
  if (!res.headersSent) {
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/* ── Auto-cleanup cron job (every 30 minutes) ─────── */
cron.schedule('*/30 * * * *', async () => {
  const ttl = parseInt(process.env.FILE_TTL_MINUTES) || 120;
  await cleanOldFiles(ttl);
  console.log('[PDFLove] Auto-cleanup ran. TTL:', ttl, 'minutes');
});

/* ── Start server ─────────────────────────────────── */
app.listen(PORT, () => {
  console.log('');
  console.log('  ❤  PDFLove Backend is running!');
  console.log(`  🌐  http://localhost:${PORT}`);
  console.log(`  🔧  API:  http://localhost:${PORT}/api/health`);
  console.log(`  📊  System check: http://localhost:${PORT}/api/system`);
  console.log('');

  // Print system tool availability on startup
  (async () => {
    const { cliAvailable } = require('./utils/helpers');
    const tools = ['gs', 'soffice', 'pdftoppm', 'tesseract', 'qpdf'];
    const status = await Promise.all(tools.map(async t => [t, await cliAvailable(t)]));
    console.log('  System tools:');
    status.forEach(([name, ok]) =>
      console.log(`    ${ok ? '✅' : '❌'} ${name.padEnd(12)} ${ok ? 'found' : 'not found (some features disabled)'}`)
    );
    console.log('');
  })();
});

module.exports = app;
