# PDFLove Backend — Local Setup & Production Deployment

## Project Structure

```
pdflove/
├── server.js           ← Main Express server (entry point)
├── package.json        ← Dependencies
├── .env                ← Environment variables
├── index.html          ← Frontend (served by Express)
├── routes/
│   ├── organize.js     ← Merge, Split, Rotate, Page Numbers, Organize
│   ├── edit.js         ← Watermark, Sign, Flatten, Redact, Compare
│   ├── security.js     ← Protect, Unlock
│   ├── optimize.js     ← Compress, Extract Text, OCR, Repair
│   └── convert.js      ← PDF↔Word/Excel/PPT, PDF↔JPG, Images→PDF, HTML→PDF
├── middleware/
│   └── upload.js       ← Multer file upload config
├── utils/
│   └── helpers.js      ← Shared utilities, cleanup, CLI detection
├── uploads/            ← Temp upload folder (auto-created)
└── outputs/            ← Processed files (auto-created, auto-deleted after 2h)
```

---

## Prerequisites

- **Node.js v18+** — https://nodejs.org
- **npm** (comes with Node.js)

Check your version:
```bash
node --version    # should be v18.0.0 or higher
npm --version     # should be 8+
```

---

## Step 1 — Install Node.js (if not already installed)

### macOS
```bash
brew install node
# OR download from https://nodejs.org
```

### Ubuntu / Debian Linux
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Windows
Download and run installer from: https://nodejs.org/en/download

---

## Step 2 — Clone / Extract Project

If you have the files already, navigate to the folder:
```bash
cd pdflove
```

---

## Step 3 — Install npm Dependencies

```bash
npm install
```

This installs: express, pdf-lib, pdf-parse, sharp, multer, cors, archiver, uuid, dotenv, morgan, helmet, express-rate-limit, node-cron, fs-extra, mime-types

---

## Step 4 — Install System Tools (Optional but Recommended)

These unlock additional features. Install what you need:

### Ubuntu / Debian / WSL
```bash
# Ghostscript (PDF compression — highly recommended)
sudo apt install ghostscript

# LibreOffice (Word/Excel/PPT conversions — recommended)
sudo apt install libreoffice

# Poppler (PDF to JPG conversion)
sudo apt install poppler-utils

# Tesseract OCR (PDF text recognition from scanned files)
sudo apt install tesseract-ocr

# QPDF (real AES-256 PDF encryption/decryption)
sudo apt install qpdf

# All at once:
sudo apt install ghostscript libreoffice poppler-utils tesseract-ocr qpdf
```

### macOS (with Homebrew)
```bash
brew install ghostscript
brew install poppler
brew install tesseract
brew install qpdf
brew install --cask libreoffice
```

### Windows
- Ghostscript: https://www.ghostscript.com/releases/gsdnld.html
- LibreOffice: https://www.libreoffice.org/download
- Tesseract: https://github.com/UB-Mannheim/tesseract/wiki
- QPDF: https://github.com/qpdf/qpdf/releases

---

## Step 5 — Configure Environment

Edit `.env` file:
```env
PORT=3000
NODE_ENV=development
ALLOWED_ORIGIN=http://localhost:3000
MAX_FILE_SIZE=209715200
FILE_TTL_MINUTES=120
```

---

## Step 6 — Start the Server

### Development mode (auto-restart on changes)
```bash
npm run dev
```

### Production mode
```bash
npm start
```

You should see:
```
  ❤  PDFLove Backend is running!
  🌐  http://localhost:3000
  🔧  API:  http://localhost:3000/api/health
  📊  System check: http://localhost:3000/api/system

  System tools:
    ✅ gs           found
    ✅ soffice      found
    ❌ pdftoppm     not found (some features disabled)
    ❌ tesseract    not found (some features disabled)
    ✅ qpdf         found
    ❌ convert      not found (some features disabled)
```

---

## Step 7 — Open the Website

Open your browser and go to:
```
http://localhost:3000
```

The full PDFLove website will load with all tools functional.

---

## Useful API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Server health check |
| `GET /api/system` | System tools status + install hints |
| `GET /api/download/:sessionId/:file` | Download a processed file |
| `POST /api/organize/merge` | Merge PDFs |
| `POST /api/organize/split` | Split PDF |
| `POST /api/organize/rotate` | Rotate PDF pages |
| `POST /api/organize/pages` | Reorder/delete pages |
| `POST /api/organize/page-numbers` | Add page numbers |
| `POST /api/optimize/compress` | Compress PDF |
| `POST /api/optimize/extract-text` | Extract text |
| `POST /api/optimize/ocr` | OCR scanned PDF |
| `POST /api/optimize/repair` | Repair PDF |
| `POST /api/convert/word-to-pdf` | Word → PDF |
| `POST /api/convert/excel-to-pdf` | Excel → PDF |
| `POST /api/convert/pptx-to-pdf` | PPT → PDF |
| `POST /api/convert/pdf-to-word` | PDF → Word |
| `POST /api/convert/pdf-to-excel` | PDF → Excel |
| `POST /api/convert/pdf-to-pptx` | PDF → PPT |
| `POST /api/convert/pdf-to-jpg` | PDF → JPG |
| `POST /api/convert/images-to-pdf` | Images → PDF |
| `POST /api/convert/html-to-pdf` | URL → PDF |
| `POST /api/edit/watermark` | Add watermark |
| `POST /api/edit/sign` | Sign PDF |
| `POST /api/edit/flatten` | Flatten PDF |
| `POST /api/edit/redact` | Redact content |
| `POST /api/edit/compare` | Compare 2 PDFs |
| `POST /api/security/protect` | Password-protect |
| `POST /api/security/unlock` | Remove password |

---

## Test the API with curl

```bash
# Health check
curl http://localhost:3000/api/health

# System status
curl http://localhost:3000/api/system

# Merge two PDFs
curl -X POST http://localhost:3000/api/organize/merge \
  -F "files=@file1.pdf" \
  -F "files=@file2.pdf"

# Compress a PDF
curl -X POST http://localhost:3000/api/optimize/compress \
  -F "file=@document.pdf" \
  -F "level=recommended"

# Rotate PDF (all pages 90 degrees)
curl -X POST http://localhost:3000/api/organize/rotate \
  -F "file=@document.pdf" \
  -F "angle=90" \
  -F "pages=all"
```

---

## Feature Support Table

| Feature | Pure JS (pdf-lib) | Ghostscript | LibreOffice | Poppler | Tesseract | QPDF |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|
| Merge PDF | ✅ | | | | | |
| Split PDF | ✅ | | | | | |
| Rotate PDF | ✅ | | | | | |
| Add Page Numbers | ✅ | | | | | |
| Watermark | ✅ | | | | | |
| Sign PDF | ✅ | | | | | |
| Flatten | ✅ | | | | | |
| Redact | ✅ | | | | | |
| Repair PDF | ✅ (basic) | | | | | ✅ (advanced) |
| Extract Text | ✅ | | | | | |
| Compress PDF | ✅ (basic) | ✅ (best) | | | | |
| Word → PDF | | | ✅ | | | |
| Excel → PDF | | | ✅ | | | |
| PPT → PDF | | | ✅ | | | |
| PDF → Word | | | ✅ | | | |
| PDF → JPG | | | | ✅ | | |
| Images → PDF | ✅ | | | | | |
| OCR | | | | ✅ | ✅ | |
| Protect PDF | ✅ (basic) | | | | | ✅ (AES-256) |
| Unlock PDF | ✅ (basic) | | | | | ✅ (robust) |

---

## Going Live — Quick Deployment

### Option A: Render.com (Free tier)
1. Push project to GitHub
2. Go to render.com → New Web Service
3. Connect your GitHub repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Add environment variables in the dashboard
7. Done! Free tier URL: `your-app.onrender.com`

### Option B: Railway.app
1. Go to railway.app → New Project
2. Deploy from GitHub
3. Set `PORT` environment variable to `3000`
4. Add a custom domain (pdflove.com)

### Option C: VPS (Full Control)
```bash
# On Ubuntu VPS
git clone your-repo
cd pdflove
npm install --production
sudo apt install ghostscript libreoffice poppler-utils tesseract-ocr qpdf

# Install PM2 process manager
sudo npm install -g pm2
pm2 start server.js --name pdflove
pm2 startup  # auto-start on reboot
pm2 save

# Nginx reverse proxy
sudo apt install nginx
# Create /etc/nginx/sites-available/pdflove:
# server {
#   listen 80;
#   server_name pdflove.com www.pdflove.com;
#   location / { proxy_pass http://localhost:3000; }
# }
sudo nginx -t && sudo systemctl reload nginx

# SSL
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d pdflove.com -d www.pdflove.com
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm install` fails | Ensure Node.js v18+ is installed |
| Port 3000 in use | Change PORT in .env |
| LibreOffice conversion fails | Run `soffice --version` to confirm installation |
| PDF upload fails | Check MAX_FILE_SIZE in .env |
| Files not deleting | Check uploads/ and outputs/ folder permissions |
| CORS error | Set ALLOWED_ORIGIN in .env to match your frontend URL |

---

*PDFLove Backend v1.0.0 — Built with Express + pdf-lib*
