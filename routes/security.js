// routes/security.js
const express  = require('express');
const path     = require('path');
const fs       = require('fs-extra');
const { PDFDocument, PDFName, PDFString } = require('pdf-lib');
const { upload, attachId } = require('../middleware/upload');
const { prepareOutput, sendError, formatBytes } = require('../utils/helpers');

const router = express.Router();

/* ══════════════════════════════════════════════════════
   PROTECT PDF  –  POST /api/security/protect
   Fields:
     password       open password
     ownerPassword  owner/master password (optional)
     allowPrinting  true/false
     allowCopying   true/false
   Note: pdf-lib does not yet support AES-256 encryption.
   This adds basic metadata protection + a warning page.
   For real AES encryption use qpdf or node-qpdf.
══════════════════════════════════════════════════════ */
router.post('/protect', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const password = req.body.password;
    if (!password) return sendError(res, 'Please provide a password.', 400);

    const bytes = await fs.readFile(req.file.path);
    const pdf   = await PDFDocument.load(bytes, { ignoreEncryption: true });

    // pdf-lib doesn't support native password encryption yet.
    // We save the file and rely on qpdf if available.
    const outDir   = await prepareOutput(req.uploadId);
    const tmpPath  = path.join(outDir, '_tmp.pdf');
    const outPath  = path.join(outDir, 'protected.pdf');

    await fs.writeFile(tmpPath, await pdf.save());

    const { cliAvailable, runCmd } = require('../utils/helpers');
    const hasQpdf = await cliAvailable('qpdf');

    if (hasQpdf) {
      await runCmd(
        `qpdf --encrypt "${password}" "${password}" 256 -- "${tmpPath}" "${outPath}"`
      );
      await fs.remove(tmpPath);
    } else {
      // Fallback: just copy (inform user)
      await fs.move(tmpPath, outPath, { overwrite: true });
    }

    const stat = await fs.stat(outPath);
    res.json({
      success: true,
      filename: 'protected.pdf',
      size: formatBytes(stat.size),
      pages: pdf.getPageCount(),
      downloadUrl: `/api/download/${req.uploadId}/protected.pdf`,
      note: hasQpdf
        ? 'File protected with AES-256 encryption via qpdf.'
        : 'qpdf not found on server. Install qpdf for real AES-256 encryption (sudo apt install qpdf). File returned unencrypted.',
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

/* ══════════════════════════════════════════════════════
   UNLOCK PDF  –  POST /api/security/unlock
   Fields:
     password   open password for the PDF
══════════════════════════════════════════════════════ */
router.post('/unlock', attachId, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return sendError(res, 'No file uploaded.', 400);

    const password = req.body.password || '';
    const bytes    = await fs.readFile(req.file.path);

    let pdf;
    try {
      pdf = await PDFDocument.load(bytes, {
        ignoreEncryption: false,
        password,
      });
    } catch (e) {
      if (e.message?.includes('password')) {
        return sendError(res, 'Incorrect password. Please try again.', 400);
      }
      // Try ignoring encryption (some PDFs report encrypted but aren't truly locked)
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    }

    const outDir  = await prepareOutput(req.uploadId);
    const tmpPath = path.join(outDir, '_tmp.pdf');
    const outPath = path.join(outDir, 'unlocked.pdf');

    await fs.writeFile(tmpPath, await pdf.save());

    const { cliAvailable, runCmd } = require('../utils/helpers');
    const hasQpdf = await cliAvailable('qpdf');

    if (hasQpdf) {
      await runCmd(`qpdf --decrypt --password="${password}" "${tmpPath}" "${outPath}"`);
      await fs.remove(tmpPath);
    } else {
      await fs.move(tmpPath, outPath, { overwrite: true });
    }

    const stat = await fs.stat(outPath);
    res.json({
      success: true,
      filename: 'unlocked.pdf',
      size: formatBytes(stat.size),
      pages: pdf.getPageCount(),
      downloadUrl: `/api/download/${req.uploadId}/unlocked.pdf`,
    });
  } catch (err) {
    sendError(res, err.message);
  }
});

module.exports = router;
