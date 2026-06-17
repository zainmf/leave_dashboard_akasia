// Attachment storage on Supabase Storage (free tier). Keeps the same interface
// the server expects: uploadAttachment(), signedUrl(), storageEnabled().
// Swap to Cloudflare R2 / S3 by re-implementing these three functions.
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY; // service_role key — server-side only
const bucket = process.env.SUPABASE_BUCKET || "attachments";

const sb = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

export const storageEnabled = () => Boolean(sb);

// Upload a Buffer, return the object key stored on the request row.
export async function uploadAttachment(buffer, originalName, mimetype) {
  if (!sb) throw new Error("Supabase storage not configured");
  const ext = (originalName.match(/\.[a-z0-9]+$/i) || [""])[0];
  const path = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const { error } = await sb.storage.from(bucket).upload(path, buffer, { contentType: mimetype, upsert: false });
  if (error) throw error;
  return path;
}

// Short-lived signed URL so the browser can view a file from a PRIVATE bucket.
export async function signedUrl(keyPath, minutes = 10) {
  if (!sb || !keyPath) return null;
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(keyPath, minutes * 60);
  return error ? null : data.signedUrl;
}
