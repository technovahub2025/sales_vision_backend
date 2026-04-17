import multer from 'multer';

const MAX_FILES = 5;
const rawMaxUploadSizeMb = Number(process.env.MAX_UPLOAD_SIZE_MB || 10);
const MAX_SIZE_MB = Number.isNaN(rawMaxUploadSizeMb) || rawMaxUploadSizeMb <= 0
  ? 10
  : rawMaxUploadSizeMb;
const MAX_BYTES = MAX_SIZE_MB * 1024 * 1024;

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
]);

const storage = multer.memoryStorage();

function createUploader(fieldName) {
  const upload = multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: MAX_FILES },
    fileFilter: (req, file, cb) => {
      if (!allowedTypes.has(file.mimetype)) {
        const error = new Error('Unsupported file type');
        error.code = 'INVALID_FILE_TYPE';
        return cb(error);
      }
      return cb(null, true);
    },
  }).array(fieldName, MAX_FILES);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (!err) return next();

      let message = err.message || 'Invalid file upload.';
      if (err.code === 'LIMIT_FILE_SIZE') {
        message = `File too large. Max ${MAX_SIZE_MB}MB.`;
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        message = `Too many files. Max ${MAX_FILES}.`;
      }
      return res.status(400).json({
        success: false,
        code: 'INVALID_FILE',
        message,
        allowedTypes: Array.from(allowedTypes),
        maxSizeMb: MAX_SIZE_MB,
      });
    });
  };
}

export const uploadFiles = createUploader('files');
export const uploadSingle = createUploader('file');
