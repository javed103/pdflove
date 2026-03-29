// middleware/upload.js
const multer = require('multer');
const path   = require('path');
const fs     = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
fs.ensureDirSync(UPLOAD_DIR);

// Allowed MIME types per category
const ALLOWED_TYPES = {
  pdf:   ['application/pdf'],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/tiff'],
  word:  ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  excel: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ppt:   ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  html:  ['text/html'],
};

const ALL_ALLOWED = Object.values(ALLOWED_TYPES).flat();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.uploadId);
    fs.ensureDirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // sanitise original name
    const ext  = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
                     .replace(/[^a-zA-Z0-9_-]/g, '_')
                     .substring(0, 60);
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALL_ALLOWED.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  }
};

// Attach a unique upload session ID before multer runs
const attachId = (req, res, next) => {
  req.uploadId = uuidv4();
  next();
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize:  parseInt(process.env.MAX_FILE_SIZE || '209715200'),  // 200 MB
    files: 20,
  },
});

module.exports = { upload, attachId, ALLOWED_TYPES };
