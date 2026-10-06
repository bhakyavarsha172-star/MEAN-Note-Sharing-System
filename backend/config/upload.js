const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(16).toString('hex');
    cb(null, `${unique}${path.extname(file.originalname)}`);
  }
});

// 10 MB per file, up to 5 files per upload request
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});

module.exports = upload;
