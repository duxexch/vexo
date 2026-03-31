import { Client } from "minio";
import { logger } from "./logger";

// MinIO client for object storage (avatars, uploads, attachments)
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "localhost";
const MINIO_PORT = parseInt(process.env.MINIO_PORT || "9000", 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "";
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === "true";
const MINIO_BUCKET = process.env.MINIO_BUCKET || "vex-uploads";

// SECURITY: Validate MinIO credentials in production
if (process.env.NODE_ENV === 'production' && (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY)) {
  logger.warn('[MinIO] MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set in production!');
}

let minioClient: Client | null = null;

export function getMinioClient(): Client {
  if (!minioClient) {
    minioClient = new Client({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
    });
    logger.info(`[MinIO] Client initialized → ${MINIO_ENDPOINT}:${MINIO_PORT}`);
  }
  return minioClient;
}

/**
 * Initialize MinIO: create bucket if it doesn't exist, set public read policy
 */
export async function initMinIO(): Promise<void> {
  const client = getMinioClient();
  try {
    const exists = await client.bucketExists(MINIO_BUCKET);
    if (!exists) {
      await client.makeBucket(MINIO_BUCKET, "us-east-1");
      logger.info(`[MinIO] Bucket "${MINIO_BUCKET}" created`);

      // Set public read policy for uploaded files
      const publicPolicy = {
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${MINIO_BUCKET}/*`],
          },
        ],
      };
      await client.setBucketPolicy(MINIO_BUCKET, JSON.stringify(publicPolicy));
      logger.info(`[MinIO] Public read policy set on "${MINIO_BUCKET}"`);
    } else {
      logger.info(`[MinIO] Bucket "${MINIO_BUCKET}" already exists`);
    }
  } catch (err: unknown) {
    logger.error('[MinIO] Init error', err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

/**
 * Upload a file buffer to MinIO
 * @param objectName The name/path for the object (e.g., "avatars/user123.jpg")
 * @param buffer File data buffer
 * @param mimeType MIME type (e.g., "image/jpeg")
 * @returns The object URL path
 */
export async function uploadFile(
  objectName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const client = getMinioClient();
  await client.putObject(MINIO_BUCKET, objectName, buffer, buffer.length, {
    "Content-Type": mimeType,
  });
  return `/storage/${objectName}`;
}

/**
 * Delete a file from MinIO
 */
export async function deleteFile(objectName: string): Promise<void> {
  const client = getMinioClient();
  try {
    await client.removeObject(MINIO_BUCKET, objectName);
  } catch (err: unknown) {
    logger.warn('[MinIO] Delete error', { action: 'delete', error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Get a file stream from MinIO
 */
export async function getFileStream(objectName: string): Promise<NodeJS.ReadableStream> {
  const client = getMinioClient();
  return await client.getObject(MINIO_BUCKET, objectName);
}

/**
 * Check if a file exists in MinIO
 */
export async function fileExists(objectName: string): Promise<boolean> {
  const client = getMinioClient();
  try {
    await client.statObject(MINIO_BUCKET, objectName);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate a presigned URL for direct download (valid for 24h)
 */
export async function getPresignedUrl(
  objectName: string,
  expirySeconds: number = 86400
): Promise<string> {
  const client = getMinioClient();
  return await client.presignedGetObject(MINIO_BUCKET, objectName, expirySeconds);
}

// ==================== HEALTH CHECK ====================

export async function minioHealthCheck(): Promise<{
  status: string;
  bucket: string;
}> {
  const client = getMinioClient();
  try {
    const exists = await client.bucketExists(MINIO_BUCKET);
    return {
      status: exists ? "connected" : "bucket_missing",
      bucket: MINIO_BUCKET,
    };
  } catch (err: unknown) {
    return {
      status: `error: ${err instanceof Error ? err.message : String(err)}`,
      bucket: MINIO_BUCKET,
    };
  }
}

export function getBucketName(): string {
  return MINIO_BUCKET;
}
