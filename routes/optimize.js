// routes/optimize.js
const express  = require('express');
const path     = require('path');
const fs       = require('fs-extra');
const { PDFDocument } = require('pdf-lib');
const pdfParse = require('pdf-parse');
const { upload, attachId } = require('../middleware/upload');
const { prepareOutput, sendError, formatBytes, cliAvailable, runCmd } = require('../utils/helpers');

const router = express.Router();

/* ══════════════════════════════════════════════════════
   COMPRESS PDF  –  POST /api/optimize/compress
   Fields:
     level  "extreme" | "recommended" | "low"
   Uses Ghostscript when available, falls back to pdf-lib re-save.
══════════════════════════════════════════════════════ */
router.post('/compress', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const level   = req.body.level || 'recommended';
    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'compressed.pdf');

    const gsQuality = {
      extreme:     '/screen',
      recommended: '/ebook',
      low:         '/printer',
    }[level] || '/ebook';

    const hasGs = await cliAvailable('gs');

    if (hasGs) {
      await runCmd(
        `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=${gsQuality} ` +
        `-dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outPath}" "${req.file.path}"`
      );
    } else {
      // Fallback: pdf-lib re-save (minor optimization via object stream)
      const bytes = await fs.readFile(req.file.path);
      const pdf   = await PDFDocument.load(bytes, { ignoreEncryption: true });
      await fs.writeFile(outPath, await pdf.save({ useObjectStreams: true }));
    }

    const origSize  = req.file.size;
    const stat      = await fs.stat(outPath);
    const newSize   = stat.size;
    const reduction = origSize > 0 ? Math.round((1 - newSize / origSize) * 100) : 0;

    const bytes = await fs.readFile(outPath);
    const pdf   = await PDFDocument.load(bytes, { ignoreEncryption: true });

    res.json({
      success:      true,
      filename:     'compressed.pdf',
      originalSize: formatBytes(origSize),
      newSize:      formatBytes(newSize),
      reduction:    `${Math.max(0, reduction)}%`,
      pages:        pdf.getPageCount(),
      usedGs:       hasGs,
      downloadUrl:  `/api/download/${req.uploadId}/compressed.pdf`,
      note: hasGs ? null : 'Ghostscript not found. Install with: sudo apt install ghostscript. Basic pdf-lib compression used.',
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   EXTRACT TEXT (PDF to Text)  –  POST /api/optimize/extract-text
══════════════════════════════════════════════════════ */
router.post('/extract-text', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const bytes = await fs.readFile(req.file.path);
    const data  = await pdfParse(bytes);

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'extracted.txt');
    await fs.writeFile(outPath, data.text, 'utf8');
    const stat = await fs.stat(outPath);

    res.json({
      success:   true,
      filename:  'extracted.txt',
      size:      formatBytes(stat.size),
      pages:     data.numpages,
      charCount: data.text.length,
      wordCount: data.text.split(/\s+/).filter(Boolean).length,
      preview:   data.text.substring(0, 500),
      downloadUrl: `/api/download/${req.uploadId}/extracted.txt`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   OCR PDF  –  POST /api/optimize/ocr
   Requires: tesseract + poppler-utils (pdftoppm)
══════════════════════════════════════════════════════ */
router.post('/ocr', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const hasTesseract = await cliAvailable('tesseract');
    const hasPdftoppm  = await cliAvailable('pdftoppm');

    if (!hasTesseract || !hasPdftoppm) {
      return res.json({
        success: false,
        note: 'OCR requires Tesseract and poppler-utils.',
        installCmd: 'sudo apt install tesseract-ocr poppler-utils',
      });
    }

    const lang    = req.body.lang || 'eng';
    const outDir  = await prepareOutput(req.uploadId);
    const imgDir  = path.join(outDir, 'pages');
    await fs.ensureDir(imgDir);

    // Convert PDF pages to images
    await runCmd(`pdftoppm -r 200 -png "${req.file.path}" "${imgDir}/page"`, 120000);

    const imgFiles = (await fs.readdir(imgDir))
      .filter(f => f.endsWith('.png'))
      .sort()
      .map(f => path.join(imgDir, f));

    let fullText = '';
    for (const img of imgFiles) {
      const { stdout } = await runCmd(`tesseract "${img}" stdout -l ${lang} 2>/dev/null`, 30000);
      fullText += stdout + '\n';
    }

    const outPath = path.join(outDir, 'ocr_result.txt');
    await fs.writeFile(outPath, fullText, 'utf8');
    await fs.remove(imgDir);

    const stat = await fs.stat(outPath);
    res.json({
      success:   true,
      filename:  'ocr_result.txt',
      size:      formatBytes(stat.size),
      wordCount: fullText.split(/\s+/).filter(Boolean).length,
      preview:   fullText.substring(0, 500),
      downloadUrl: `/api/download/${req.uploadId}/ocr_result.txt`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   REPAIR PDF  –  POST /api/optimize/repair
   Uses pdf-lib to re-save which fixes most structural issues.
══════════════════════════════════════════════════════ */
router.post('/repair', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const bytes   = await fs.readFile(req.file.path);
    let pdf;
    try {
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch {
      // If pdf-lib fails, try qpdf
      const hasQpdf = await cliAvailable('qpdf');
      if (!hasQpdf) return sendError(res, 'Could not repair PDF. Install qpdf for advanced repair.', 500);
      const outDir  = await prepareOutput(req.uploadId);
      const outPath = path.join(outDir, 'repaired.pdf');
      await runCmd(`qpdf --linearize "${req.file.path}" "${outPath}"`, 60000);
      const stat = await fs.stat(outPath);
      return res.json({ success: true, filename: 'repaired.pdf', size: formatBytes(stat.size), downloadUrl: `/api/download/${req.uploadId}/repaired.pdf` });
    }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'repaired.pdf');
    await fs.writeFile(outPath, await pdf.save());
    const stat = await fs.stat(outPath);

    res.json({
      success: true,
      filename: 'repaired.pdf',
      size: formatBytes(stat.size),
      pages: pdf.getPageCount(),
      downloadUrl: `/api/download/${req.uploadId}/repaired.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

module.exports = router;
