import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { ReadStream } from "fs";

export type UploadType = "avatars" | "attachments";

export interface PutResult {
  // Key stored in DB (relative to type folder), e.g. `${userId}/yyyy/mm/dd/uuid.ext`
  key: string;
  // Full path on disk
  fullPath: string;
}

export interface StatResult {
  size: number;
  mtime: Date;
  contentType: string;
}

export interface StreamResult extends StatResult {
  stream: ReadStream;
}

export interface StorageDriver {
  put: (args: {
    type: UploadType;
    userId: string;
    buffer: Buffer;
    ext: string; // without dot, e.g. 'png'
    contentType: string;
    now?: Date;
  }) => Promise<PutResult>;
  getStream: (keyWithType: string) => Promise<StreamResult>; // keyWithType includes type prefix e.g. "avatars/<key>"
  delete: (keyWithType: string) => Promise<void>;
  resolvePath: (keyWithType: string) => string;
}

export function inferContentType(nameOrExt: string): string {
  const ext =
    (nameOrExt.includes(".") ? nameOrExt.split(".").pop() : nameOrExt) ?? "";
  switch (ext.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

export function userShardedKey(
  type: UploadType,
  userId: string,
  ext: string,
  now = new Date(),
) {
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const id = randomUUID();
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const key = `${userId}/${yyyy}/${mm}/${dd}/${id}.${safeExt}`;
  const withType = `${type}/${key}`;
  return { key, withType };
}

export function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export function getBaseDir() {
  return process.env.LOCAL_UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
}

export { LocalStorageDriver } from "./local";
