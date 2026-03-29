// routes/edit.js
const express  = require('express');
const path     = require('path');
const fs       = require('fs-extra');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const { upload, attachId } = require('../middleware/upload');
const { prepareOutput, sendFile, sendError, formatBytes } = require('../utils/helpers');

const router = express.Router();

/* ══════════════════════════════════════════════════════
   WATERMARK  –  POST /api/edit/watermark
   Fields:
     text        watermark text
     opacity     0.0–1.0  (default 0.2)
     angle       rotation degrees (default 45)
     fontSize    (default 48)
     color       "gray" | "red" | "blue" (default gray)
     position    "center" | "tile" | "top-right" | "bottom-left"
══════════════════════════════════════════════════════ */
router.post('/watermark', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const text     = req.body.text || 'CONFIDENTIAL';
    const opacity  = Math.min(1, Math.max(0, parseFloat(req.body.opacity) || 0.2));
    const angle    = parseInt(req.body.angle) || 45;
    const fontSize = parseInt(req.body.fontSize) || 48;
    const position = req.body.position || 'center';

    const colorMap = {
      gray:  rgb(0.5, 0.5, 0.5),
      red:   rgb(0.8, 0.1, 0.1),
      blue:  rgb(0.1, 0.1, 0.8),
      black: rgb(0, 0, 0),
    };
    const color = colorMap[req.body.color] || colorMap.gray;

    const bytes = await fs.readFile(req.file.path);
    const pdf   = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font  = await pdf.embedFont(StandardFonts.HelveticaBold);

    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      const tw = font.widthOfTextAtSize(text, fontSize);

      if (position === 'tile') {
        // Tile every ~200px
        for (let y = 60; y < height; y += 180) {
          for (let x = 0; x < width; x += tw + 60) {
            page.drawText(text, {
              x, y, size: fontSize, font, color,
              opacity, rotate: degrees(angle),
            });
          }
        }
      } else {
        let x, y;
        if (position === 'center')       { x = (width - tw) / 2; y = height / 2; }
        else if (position === 'top-right')    { x = width - tw - 30; y = height - 60; }
        else if (position === 'bottom-left')  { x = 30; y = 40; }
        else { x = (width - tw) / 2; y = height / 2; }

        page.drawText(text, { x, y, size: fontSize, font, color, opacity, rotate: degrees(angle) });
      }
    }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'watermarked.pdf');
    await fs.writeFile(outPath, await pdf.save());
    const stat = await fs.stat(outPath);

    res.json({
      success: true,
      filename: 'watermarked.pdf',
      size: formatBytes(stat.size),
      pages: pdf.getPageCount(),
      downloadUrl: `/api/download/${req.uploadId}/watermarked.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   SIGN PDF  –  POST /api/edit/sign
   Body: file (PDF) + signatureImage (PNG/JPG of signature)
   Fields:
     page       page number (default last page)
     x, y       position (default bottom-right)
     width      signature width in pt (default 160)
══════════════════════════════════════════════════════ */
router.post('/sign', attachId, upload.fields([
  { name: 'file',            maxCount: 1 },
  { name: 'signatureImage',  maxCount: 1 },
]), async (req, res) => {
  try {
    const pdfFile = req.files?.file?.[0];
    const sigFile = req.files?.signatureImage?.[0];
    if (!pdfFile) return sendError(res, 'No PDF file uploaded.', 400);

    const bytes = await fs.readFile(pdfFile.path);
    const pdf   = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = pdf.getPageCount();

    const pageNum = Math.min(Math.max(1, parseInt(req.body.page) || total), total);
    const page    = pdf.getPage(pageNum - 1);
    const { width, height } = page.getSize();
    const sigWidth = parseInt(req.body.width) || 160;

    if (sigFile) {
      // Embed actual signature image
      const imgBytes = await fs.readFile(sigFile.path);
      let img;
      if (sigFile.mimetype === 'image/png') img = await pdf.embedPng(imgBytes);
      else img = await pdf.embedJpg(imgBytes);

      const aspect  = img.height / img.width;
      const sigH    = sigWidth * aspect;
      const xPos    = parseFloat(req.body.x) || (width - sigWidth - 30);
      const yPos    = parseFloat(req.body.y) || 40;

      page.drawImage(img, { x: xPos, y: yPos, width: sigWidth, height: sigH });
    } else {
      // Draw a typed signature placeholder
      const sigText = req.body.signatureText || 'Signed';
      const font    = await pdf.embedFont(StandardFonts.TimesRomanItalic);
      const xPos    = parseFloat(req.body.x) || (width - 200);
      const yPos    = parseFloat(req.body.y) || 50;
      page.drawText(sigText, { x: xPos, y: yPos, size: 24, font, color: rgb(0.05, 0.1, 0.6) });
      // Draw line under signature
      page.drawLine({
        start: { x: xPos - 4, y: yPos - 4 },
        end:   { x: xPos + font.widthOfTextAtSize(sigText, 24) + 4, y: yPos - 4 },
        thickness: 1,
        color: rgb(0.05, 0.1, 0.6),
      });
    }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'signed.pdf');
    await fs.writeFile(outPath, await pdf.save());
    const stat = await fs.stat(outPath);

    res.json({
      success: true,
      filename: 'signed.pdf',
      size: formatBytes(stat.size),
      pages: total,
      downloadUrl: `/api/download/${req.uploadId}/signed.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   FLATTEN PDF  –  POST /api/edit/flatten
   (Removes interactive annotations, stamps form values)
══════════════════════════════════════════════════════ */
router.post('/flatten', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const bytes = await fs.readFile(req.file.path);
    const pdf   = await PDFDocument.load(bytes, { ignoreEncryption: true });

    // Flatten form fields by removing the AcroForm
    const form = pdf.getForm();
    try { form.flatten(); } catch (_) { /* no form fields */ }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'flattened.pdf');
    await fs.writeFile(outPath, await pdf.save());
    const stat = await fs.stat(outPath);

    res.json({
      success: true,
      filename: 'flattened.pdf',
      size: formatBytes(stat.size),
      pages: pdf.getPageCount(),
      downloadUrl: `/api/download/${req.uploadId}/flattened.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   REDACT PDF  –  POST /api/edit/redact
   Fields:
     areas  JSON array of { page, x, y, width, height }
            (coordinates in points, 1-based page number)
══════════════════════════════════════════════════════ */
router.post('/redact', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    let areas = [];
    try { areas = JSON.parse(req.body.areas || '[]'); } catch { areas = []; }

    const bytes = await fs.readFile(req.file.path);
    const pdf   = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const total = pdf.getPageCount();

    if (!areas.length) {
      // Demo: redact a strip at the top of every page
      for (let i = 0; i < total; i++) {
        const page = pdf.getPage(i);
        const { width, height } = page.getSize();
        page.drawRectangle({ x: 40, y: height - 80, width: width - 80, height: 30, color: rgb(0, 0, 0) });
      }
    } else {
      for (const area of areas) {
        const pageIdx = Math.min(Math.max(1, area.page || 1), total) - 1;
        const page    = pdf.getPage(pageIdx);
        page.drawRectangle({
          x: area.x || 0, y: area.y || 0,
          width: area.width || 100, height: area.height || 20,
          color: rgb(0, 0, 0),
        });
      }
    }

    const outDir  = await prepareOutput(req.uploadId);
    const outPath = path.join(outDir, 'redacted.pdf');
    await fs.writeFile(outPath, await pdf.save());
    const stat = await fs.stat(outPath);

    res.json({
      success: true,
      filename: 'redacted.pdf',
      size: formatBytes(stat.size),
      pages: total,
      downloadUrl: `/api/download/${req.uploadId}/redacted.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   COMPARE PDF  –  POST /api/edit/compare
   Returns basic metadata comparison (page counts, sizes)
   Full visual diff requires external tools
══════════════════════════════════════════════════════ */
router.post('/compare', attachId, upload.fields([
  { name: 'file1', maxCount: 1 },
  { name: 'file2', maxCount: 1 },
]), async (req, res) => {
  try {
    const f1 = req.files?.file1?.[0];
    const f2 = req.files?.file2?.[0];
    if (!f1 || !f2) return sendError(res, 'Please upload two PDF files.', 400);

    const [b1, b2] = await Promise.all([fs.readFile(f1.path), fs.readFile(f2.path)]);
    const [p1, p2] = await Promise.all([
      PDFDocument.load(b1, { ignoreEncryption: true }),
      PDFDocument.load(b2, { ignoreEncryption: true }),
    ]);

    const info1 = { pages: p1.getPageCount(), size: formatBytes(f1.size), name: f1.originalname };
    const info2 = { pages: p2.getPageCount(), size: formatBytes(f2.size), name: f2.originalname };
    const pageDiff = Math.abs(info1.pages - info2.pages);
    const sizeDiff = Math.abs(f1.size - f2.size);

    res.json({
      success: true,
      file1: info1,
      file2: info2,
      differences: {
        pageDifference: pageDiff,
        sizeDifference: formatBytes(sizeDiff),
        identical: pageDiff === 0 && sizeDiff === 0,
      },
      note: 'Full visual page-by-page diff requires Ghostscript (gs) on the server.',
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

module.exports = router;
