const crypto = require("crypto");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;
// URL pública del bucket en R2 (dominio público .r2.dev o tu dominio propio), sin barra final.
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

const isConfigured =
  ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET && PUBLIC_URL;

if (!isConfigured) {
  console.warn(
    "[r2] Faltan variables de R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL). La subida de imágenes no funcionará hasta configurarlas."
  );
}

const client = isConfigured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
      },
    })
  : null;

const EXT = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

async function uploadImage(buffer, mimetype) {
  if (!client) throw new Error("R2 no está configurado");
  const ext = EXT[mimetype] || "jpg";
  const key = `recuerdos/${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
    })
  );
  return { key, url: `${PUBLIC_URL}/${key}` };
}

async function deleteImage(key) {
  if (!client || !key) return;
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { uploadImage, deleteImage, isConfigured };
