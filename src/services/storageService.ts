import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

function getR2Config() {
  return {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || "",
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT || "",
    bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || "collabix",
    publicUrl: process.env.CLOUDFLARE_R2_PUBLIC_URL || "",
  };
}

export function getR2Client(): S3Client | null {
  const { accessKeyId, secretAccessKey, endpoint } = getR2Config();
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    return null;
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

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
  const client = getR2Client();
  const { bucketName, publicUrl, endpoint } = getR2Config();
  if (!client) {
    throw new Error("Cloudflare R2 is not configured");
  }

  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
  const fileKey = `${folder}/${Date.now()}-${cleanFileName}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  if (publicUrl) {
    return `${publicUrl.replace(/\/+$/, "")}/${fileKey}`;
  }
  return `${endpoint}/${bucketName}/${fileKey}`;
}

export const r2Client = new Proxy({} as S3Client, {
  get(target, prop, receiver) {
    const client = getR2Client();
    if (!client) {
      throw new Error("Cloudflare R2 is not configured");
    }
    const val = (client as any)[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
});

/**
 * Deletes an object from Cloudflare R2 storage by its public URL.
 * @param fileUrl The stored public URL of the file
 */
export async function deleteFromR2(fileUrl: string): Promise<void> {
  if (!fileUrl.startsWith("http://") && !fileUrl.startsWith("https://")) {
    return;
  }

  const client = getR2Client();
  const { bucketName } = getR2Config();
  if (!client) {
    return;
  }

  try {
    const urlObj = new URL(fileUrl);
    const fileKey = urlObj.pathname.replace(/^\//, "");

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
      })
    );
    console.log(`[Cloudflare R2] Successfully deleted object: ${fileKey}`);
  } catch (err) {
    console.error("[Cloudflare R2] Failed to delete object from R2:", err);
  }
}
