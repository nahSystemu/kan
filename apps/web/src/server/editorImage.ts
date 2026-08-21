import { createHmac, timingSafeEqual } from "crypto";

import { env } from "~/env";

/**
 * Editor images live in the (private) attachments bucket but are embedded in
 * card descriptions, comments and pages as plain <img src>. A presigned S3 URL
 * would expire and break the stored HTML, so the src points at
 * /api/image/<key> instead and carries an HMAC of the key. The signature is
 * what proves the key was minted by this server: without it the proxy would
 * happily stream any object in the bucket, including other workspaces' private
 * attachments.
 */
const signKey = (key: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`editor-image:${key}`)
    .digest("hex");

export const buildEditorImageUrl = (key: string) =>
  `/api/image/${key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}?t=${signKey(key)}`;

export const verifyEditorImageToken = (key: string, token: string) => {
  const expected = Buffer.from(signKey(key));
  const provided = Buffer.from(token);

  if (expected.length !== provided.length) return false;

  return timingSafeEqual(expected, provided);
};
