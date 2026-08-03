import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "";
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "";
const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || "";
const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME || "collabix";
const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || "";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

/**
 * Uploads any file buffer to Cloudflare R2 object storage.
 * @param folder Subfolder prefix ('screenshots' | 'attachments' | 'avatars')
 * @param fileBuffer Buffer data of the file
 * @param fileName Original or target filename
 * @param contentType MIME type (e.g. 'image/png', 'application/pdf')
 * @returns Public URL or R2 endpoint path to the stored file
 */
export async function uploadToR2(
  folder: "screenshots" | "attachments" | "avatars",
  fileBuffer: Buffer,
  fileName: string,
  contentType: string
): Promise<string> {
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const fileKey = `${folder}/${Date.now()}-${cleanFileName}`;

  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  if (publicUrl) {
    return `${publicUrl}/${fileKey}`;
  }
  return `${endpoint}/${bucketName}/${fileKey}`;
}
