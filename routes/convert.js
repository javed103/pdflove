// routes/convert.js
const express  = require('express');
const path     = require('path');
const fs       = require('fs-extra');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const sharp    = require('sharp');
const { upload, attachId } = require('../middleware/upload');
const { prepareOutput, sendError, formatBytes, cliAvailable, runCmd } = require('../utils/helpers');

const router = express.Router();

/* ─────────────────────────────────────────────────────
   Helper: convert via LibreOffice
   (Works for: docx→pdf, xlsx→pdf, pptx→pdf, pdf→docx)
───────────────────────────────────────────────────── */
async function libreofficeConvert(inputPath, outDir, targetFormat = 'pdf') {
  const hasSoffice = await cliAvailable('soffice') || await cliAvailable('libreoffice');
  if (!hasSoffice) {
    throw new Error(
      'LibreOffice not installed. Run: sudo apt install libreoffice\n' +
      'On macOS: brew install --cask libreoffice'
    );
  }
  const bin = (await cliAvailable('soffice')) ? 'soffice' : 'libreoffice';
  await runCmd(
    `${bin} --headless --convert-to ${targetFormat} --outdir "${outDir}" "${inputPath}"`,
    120000
  );
  // Find converted file
  const files = await fs.readdir(outDir);
  const match = files.find(f => f.endsWith(`.${targetFormat}`));
  if (!match) throw new Error('LibreOffice conversion produced no output file.');
  return path.join(outDir, match);
}

/* ════════════════════════════════════════════════════════
   WORD → PDF   POST /api/convert/word-to-pdf
════════════════════════════════════════════════════════ */
router.post('/word-to-pdf', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);
    const outDir  = await prepareOutput(req.uploadId);
    const outPath = await libreofficeConvert(req.file.path, outDir, 'pdf');
    const renamed = path.join(outDir, 'converted.pdf');
    await fs.move(outPath, renamed, { overwrite: true });
    const stat = await fs.stat(renamed);
    res.json({ success: true, filename: 'converted.pdf', size: formatBytes(stat.size), downloadUrl: `/api/download/${req.uploadId}/converted.pdf` });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ════════════════════════════════════════════════════════
   EXCEL → PDF   POST /api/convert/excel-to-pdf
════════════════════════════════════════════════════════ */
router.post('/excel-to-pdf', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);
    const outDir  = await prepareOutput(req.uploadId);
    const outPath = await libreofficeConvert(req.file.path, outDir, 'pdf');
    const renamed = path.join(outDir, 'converted.pdf');
    await fs.move(outPath, renamed, { overwrite: true });
    const stat = await fs.stat(renamed);
    res.json({ success: true, filename: 'converted.pdf', size: formatBytes(stat.size), downloadUrl: `/api/download/${req.uploadId}/converted.pdf` });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ════════════════════════════════════════════════════════
   POWERPOINT → PDF   POST /api/convert/pptx-to-pdf
════════════════════════════════════════════════════════ */
router.post('/pptx-to-pdf', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);
    const outDir  = await prepareOutput(req.uploadId);
    const outPath = await libreofficeConvert(req.file.path, outDir, 'pdf');
    const renamed = path.join(outDir, 'converted.pdf');
    await fs.move(outPath, renamed, { overwrite: true });
    const stat = await fs.stat(renamed);
    res.json({ success: true, filename: 'converted.pdf', size: formatBytes(stat.size), downloadUrl: `/api/download/${req.uploadId}/converted.pdf` });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ════════════════════════════════════════════════════════
   PDF → WORD   POST /api/convert/pdf-to-word
   Uses LibreOffice for best results.
════════════════════════════════════════════════════════ */
router.post('/pdf-to-word', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);
    const outDir  = await prepareOutput(req.uploadId);
    const outPath = await libreofficeConvert(req.file.path, outDir, 'docx');
    const renamed = path.join(outDir, 'converted.docx');
    await fs.move(outPath, renamed, { overwrite: true });
    const stat = await fs.stat(renamed);
    res.json({ success: true, filename: 'converted.docx', size: formatBytes(stat.size), downloadUrl: `/api/download/${req.uploadId}/converted.docx` });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ════════════════════════════════════════════════════════
   PDF → EXCEL   POST /api/convert/pdf-to-excel
════════════════════════════════════════════════════════ */
router.post('/pdf-to-excel', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);
    const outDir  = await prepareOutput(req.uploadId);
    const outPath = await libreofficeConvert(req.file.path, outDir, 'xlsx');
    const renamed = path.join(outDir, 'converted.xlsx');
    await fs.move(outPath, renamed, { overwrite: true });
    const stat = await fs.stat(renamed);
    res.json({ success: true, filename: 'converted.xlsx', size: formatBytes(stat.size), downloadUrl: `/api/download/${req.uploadId}/converted.xlsx` });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ════════════════════════════════════════════════════════
   PDF → PPT   POST /api/convert/pdf-to-pptx
════════════════════════════════════════════════════════ */
router.post('/pdf-to-pptx', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);
    const outDir  = await prepareOutput(req.uploadId);
    const outPath = await libreofficeConvert(req.file.path, outDir, 'pptx');
    const renamed = path.join(outDir, 'converted.pptx');
    await fs.move(outPath, renamed, { overwrite: true });
    const stat = await fs.stat(renamed);
    res.json({ success: true, filename: 'converted.pptx', size: formatBytes(stat.size), downloadUrl: `/api/download/${req.uploadId}/converted.pptx` });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ════════════════════════════════════════════════════════
   PDF → JPG   POST /api/convert/pdf-to-jpg
   Uses pdftoppm (poppler-utils) for high quality.
   Fields:
     dpi     72 | 150 | 300 (default 150)
     pages   "all" | "1,3,5"
════════════════════════════════════════════════════════ */
router.post('/pdf-to-jpg', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const dpi        = parseInt(req.body.dpi) || 150;
    const hasPdftoppm = await cliAvailable('pdftoppm');
    const outDir     = await prepareOutput(req.uploadId);

    if (!hasPdftoppm) {
      return res.json({
        success: false,
        note: 'pdftoppm (poppler-utils) not installed.',
        installCmd: 'sudo apt install poppler-utils  OR  brew install poppler',
      });
    }

    const imgPrefix = path.join(outDir, 'page');
    await runCmd(`pdftoppm -r ${dpi} -jpeg "${req.file.path}" "${imgPrefix}"`, 120000);

    const files = (await fs.readdir(outDir))
      .filter(f => f.endsWith('.jpg') || f.endsWith('.jpeg'))
      .sort()
      .map(f => ({
        filename:    f,
        downloadUrl: `/api/download/${req.uploadId}/${f}`,
      }));

    res.json({ success: true, files, count: files.length });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ════════════════════════════════════════════════════════
   JPG / PNG / IMAGE → PDF   POST /api/convert/images-to-pdf
   Body: files[] (multiple images)
   Fields:
     pageSize   "A4" | "Letter" | "original"
     margin     number in points (default 0)
════════════════════════════════════════════════════════ */
router.post('/images-to-pdf', attachId, upload.array('files', 30), async (req, res) => {
  try {
    if (!req.files?.length) return sendError(res, 'No images uploaded.', 400);

    const margin   = parseInt(req.body.margin) || 0;
    const pageSize = req.body.pageSize || 'original';
    const pdf      = await PDFDocument.create();

    const PAGE_SIZES = {
      A4:     [595.28, 841.89],
      Letter: [612, 792],
      A3:     [841.89, 1190.55],
    };

    for (const file of req.files) {
      let imgBytes = await fs.readFile(file.path);

      // Convert to PNG via sharp for reliability
      imgBytes = await sharp(imgBytes).png().toBuffer();
      const img = await pdf.embedPng(imgBytes);

      let [pw, ph] = pageSize !== 'original' && PAGE_SIZES[pageSize]
        ? PAGE_SIZES[pageSize]
        : [img.width + margin * 2, img.height + margin * 2];

      const page = pdf.addPage([pw, ph]);
      const drawW = pw - margin * 2;
      const drawH = ph - margin * 2;
      const aspect = img.height / img.width;
      let dw = drawW, dh = drawW * aspect;
      if (dh > drawH) { dh = drawH; dw = drawH / aspect; }
      const dx = margin + (drawW - dw) / 2;
      const dy = margin + (drawH - dh) / 2;

      page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
    }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'images.pdf');
    await fs.writeFile(outPath, await pdf.save());
    const stat = await fs.stat(outPath);

    res.json({
      success: true,
      filename: 'images.pdf',
      size: formatBytes(stat.size),
      pages: pdf.getPageCount(),
      downloadUrl: `/api/download/${req.uploadId}/images.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ════════════════════════════════════════════════════════
   HTML → PDF   POST /api/convert/html-to-pdf
   Fields:  url  (a website URL to convert)
   Requires: chromium / puppeteer
════════════════════════════════════════════════════════ */
router.post('/html-to-pdf', attachId, async (req, res) => {
  try {
    const url = req.body.url;
    if (!url) return sendError(res, 'Please provide a URL.', 400);

    let puppeteer;
    try { puppeteer = require('puppeteer'); } catch {
      return res.json({
        success: false,
        note: 'puppeteer not installed.',
        installCmd: 'npm install puppeteer  (then it auto-downloads Chromium)',
      });
    }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'webpage.pdf');

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page    = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.pdf({ path: outPath, format: 'A4', printBackground: true });
    await browser.close();

    const stat = await fs.stat(outPath);
    res.json({ success: true, filename: 'webpage.pdf', size: formatBytes(stat.size), downloadUrl: `/api/download/${req.uploadId}/webpage.pdf` });
  } catch (err) {
    sendError(res, err.message);
  }
});

module.exports = router;
