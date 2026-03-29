// routes/organize.js
const express  = require('express');
const path     = require('path');
const fs       = require('fs-extra');
const { PDFDocument, degrees, StandardFonts, rgb } = require('pdf-lib');
const { upload, attachId } = require('../middleware/upload');
const { prepareOutput, sendFile, sendError, parsePageRanges, formatBytes } = require('../utils/helpers');

const router = express.Router();

/* ══════════════════════════════════════════════════════
   MERGE PDF  –  POST /api/organize/merge
   Body: files[] (multiple PDFs)
══════════════════════════════════════════════════════ */
router.post('/merge', attachId, upload.array('files', 20), async (req, res) => {
  try {
    if (!req.files || req.files.length < 2)
      return sendError(res, 'Please upload at least 2 PDF files.', 400);

    const merged = await PDFDocument.create();

    for (const file of req.files) {
      const bytes = await fs.readFile(file.path);
      const src   = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'merged.pdf');
    await fs.writeFile(outPath, await merged.save());

    const stat = await fs.stat(outPath);
    res.json({
      success:  true,
      filename: 'merged.pdf',
      size:     formatBytes(stat.size),
      pages:    merged.getPageCount(),
      downloadUrl: `/api/download/${req.uploadId}/merged.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   SPLIT PDF  –  POST /api/organize/split
   Body: file (single PDF)
   Fields:
     mode      "pages" | "range" | "every"
     pages     "1,3,5"        (mode=pages)
     ranges    "1-3,4-6"      (mode=range)
     every     2              (mode=every)
══════════════════════════════════════════════════════ */
router.post('/split', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const bytes = await fs.readFile(req.file.path);
    const src   = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = src.getPageCount();
    const mode  = req.body.mode || 'every';
    const outDir = await prepareOutput(req.uploadId);

    let groups = [];  // array of page-index arrays (0-based)

    if (mode === 'pages') {
      const pages = parsePageRanges(req.body.pages, total);
      groups = pages.map(p => [p - 1]);
    } else if (mode === 'range') {
      const rawRanges = String(req.body.ranges || '').split(',');
      for (const r of rawRanges) {
        const trimmed = r.trim();
        if (!trimmed) continue;
        if (trimmed.includes('-')) {
          const [a, b] = trimmed.split('-').map(Number);
          groups.push(Array.from({ length: b - a + 1 }, (_, i) => a - 1 + i));
        } else {
          groups.push([Number(trimmed) - 1]);
        }
      }
    } else {
      // every N pages
      const n = Math.max(1, parseInt(req.body.every) || 1);
      for (let i = 0; i < total; i += n) {
        groups.push(Array.from({ length: Math.min(n, total - i) }, (_, j) => i + j));
      }
    }

    if (!groups.length) return sendError(res, 'No valid page ranges specified.', 400);

    const files = [];
    for (let g = 0; g < groups.length; g++) {
      const part  = await PDFDocument.create();
      const pages = await part.copyPages(src, groups[g].filter(i => i >= 0 && i < total));
      pages.forEach(p => part.addPage(p));
      const name = `part_${String(g + 1).padStart(3, '0')}.pdf`;
      const dest = path.join(outDir, name);
      await fs.writeFile(dest, await part.save());
      const stat = await fs.stat(dest);
      files.push({ filename: name, pages: part.getPageCount(), size: formatBytes(stat.size), downloadUrl: `/api/download/${req.uploadId}/${name}` });
    }

    res.json({ success: true, files });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   ROTATE PDF  –  POST /api/organize/rotate
   Fields:
     angle   90 | 180 | 270
     pages   "all" | "1,3,5" | "odd" | "even"
══════════════════════════════════════════════════════ */
router.post('/rotate', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const bytes  = await fs.readFile(req.file.path);
    const pdf    = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total  = pdf.getPageCount();
    const angle  = parseInt(req.body.angle) || 90;
    const pagesParam = req.body.pages || 'all';

    let pageIndices = [];
    if (pagesParam === 'all')  pageIndices = Array.from({ length: total }, (_, i) => i);
    else if (pagesParam === 'odd')  pageIndices = Array.from({ length: total }, (_, i) => i).filter(i => i % 2 === 0);
    else if (pagesParam === 'even') pageIndices = Array.from({ length: total }, (_, i) => i).filter(i => i % 2 === 1);
    else pageIndices = parsePageRanges(pagesParam, total).map(p => p - 1);

    for (const i of pageIndices) {
      const page    = pdf.getPage(i);
      const current = page.getRotation().angle;
      page.setRotation(degrees((current + angle) % 360));
    }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'rotated.pdf');
    await fs.writeFile(outPath, await pdf.save());
    const stat = await fs.stat(outPath);

    res.json({
      success:  true,
      filename: 'rotated.pdf',
      size:     formatBytes(stat.size),
      pages:    total,
      downloadUrl: `/api/download/${req.uploadId}/rotated.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   ORGANIZE (reorder / delete pages)
   POST /api/organize/pages
   Fields:
     order   JSON array of 1-based page numbers e.g. [3,1,2]
             (omit a page to delete it)
══════════════════════════════════════════════════════ */
router.post('/pages', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const bytes = await fs.readFile(req.file.path);
    const src   = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = src.getPageCount();

    let order;
    try { order = JSON.parse(req.body.order || '[]'); } catch { order = []; }
    if (!order.length) order = Array.from({ length: total }, (_, i) => i + 1);

    const validOrder = order
      .map(Number)
      .filter(n => n >= 1 && n <= total)
      .map(n => n - 1);

    if (!validOrder.length) return sendError(res, 'No valid page order provided.', 400);

    const out   = await PDFDocument.create();
    const pages = await out.copyPages(src, validOrder);
    pages.forEach(p => out.addPage(p));

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'organized.pdf');
    await fs.writeFile(outPath, await out.save());
    const stat = await fs.stat(outPath);

    res.json({
      success:  true,
      filename: 'organized.pdf',
      size:     formatBytes(stat.size),
      pages:    out.getPageCount(),
      downloadUrl: `/api/download/${req.uploadId}/organized.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   ADD PAGE NUMBERS  –  POST /api/organize/page-numbers
   Fields:
     position  "bottom-center" | "bottom-right" | "bottom-left" | "top-center"
     startFrom  number (default 1)
     format     "Page {n}" | "{n}" | "{n} of {total}"
     fontSize   number (default 11)
══════════════════════════════════════════════════════ */
router.post('/page-numbers', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const bytes     = await fs.readFile(req.file.path);
    const pdf       = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total     = pdf.getPageCount();
    const font      = await pdf.embedFont(StandardFonts.Helvetica);
    const fontSize  = parseFloat(req.body.fontSize) || 11;
    const startFrom = parseInt(req.body.startFrom) || 1;
    const position  = req.body.position || 'bottom-center';
    const format    = req.body.format || 'Page {n} of {total}';
    const margin    = 24;

    for (let i = 0; i < total; i++) {
      const page  = pdf.getPage(i);
      const { width, height } = page.getSize();
      const label = format.replace('{n}', i + startFrom).replace('{total}', total + startFrom - 1);
      const tw    = font.widthOfTextAtSize(label, fontSize);

      let x, y;
      if (position === 'bottom-center') { x = (width - tw) / 2; y = margin; }
      else if (position === 'bottom-right') { x = width - tw - margin; y = margin; }
      else if (position === 'bottom-left')  { x = margin; y = margin; }
      else if (position === 'top-center')   { x = (width - tw) / 2; y = height - margin - fontSize; }
      else if (position === 'top-right')    { x = width - tw - margin; y = height - margin - fontSize; }
      else { x = margin; y = height - margin - fontSize; }

      page.drawText(label, { x, y, size: fontSize, font, color: rgb(0.2, 0.2, 0.2) });
    }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'numbered.pdf');
    await fs.writeFile(outPath, await pdf.save());
    const stat = await fs.stat(outPath);

    res.json({
      success: true,
      filename: 'numbered.pdf',
      size: formatBytes(stat.size),
      pages: total,
      downloadUrl: `/api/download/${req.uploadId}/numbered.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

module.exports = router;
