import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function sanitizeSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
}

function buildFolderPath({ username, userId, entityType, entityId }) {
  const root = String(process.env.CLOUDINARY_BROADCAST_AUDIO_FOLDER || 'sales-vision').replace(/\/$/, '');
  const userSegment = `${sanitizeSegment(username || 'user')}_${sanitizeSegment(userId || 'unknown')}`;
  const entitySegment = `${sanitizeSegment(entityType || 'entity')}/${sanitizeSegment(entityId || 'unknown')}`;
  return `${root}/${userSegment}/docs/${entitySegment}`;
}

export function uploadToCloudinary(buffer, options = {}) {
  const { filename, mimeType, workspaceId, userId, username, entityType, entityId } = options;
  const folder = buildFolderPath({ username, userId, entityType, entityId, workspaceId });
  const publicId = `${Date.now()}_${sanitizeSegment(filename || 'upload')}`;

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'auto',
        filename_override: filename || undefined,
        use_filename: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          url: result?.url || '',
          secureUrl: result?.secure_url || '',
          publicId: result?.public_id || publicId,
          format: result?.format || '',
          bytes: result?.bytes || 0,
          width: result?.width || undefined,
          height: result?.height || undefined,
        });
      },
    );

    const stream = Readable.from(buffer);
    stream.pipe(uploadStream);
  });
}

export function deleteFromCloudinary(publicId) {
  if (!publicId) return Promise.resolve({ result: 'not found' });
  return cloudinary.uploader
    .destroy(publicId, { resource_type: 'auto' })
    .then((result) => ({ result: result?.result === 'ok' ? 'ok' : result?.result || 'not found' }));
}

export { cloudinary };
