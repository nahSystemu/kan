import type { NextApiRequest, NextApiResponse } from "next";
import type { Readable } from "stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";

import { withApiLogging } from "@kan/api/utils/apiLogging";
import { withRateLimit } from "@kan/api/utils/rateLimit";
import { createS3Client } from "@kan/shared/utils";

import { env } from "~/env";
import { verifyEditorImageToken } from "~/server/editorImage";

/**
 * Serves images embedded in editor content. Deliberately unauthenticated: the
 * signed key in the URL is the capability, which is what lets these images
 * render on public boards and public pages. See ~/server/editorImage.
 */
export default withRateLimit(
  { points: 300, duration: 60 },
  withApiLogging(async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const bucket = env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME;
    if (!bucket) {
      return res
        .status(500)
        .json({ error: "Attachments bucket not configured" });
    }

    const keyParam = req.query.key;
    const key = Array.isArray(keyParam) ? keyParam.join("/") : keyParam;
    const token = req.query.t;

    if (!key || typeof token !== "string") {
      return res.status(400).json({ error: "Invalid image request" });
    }

    if (!verifyEditorImageToken(key, token)) {
      return res.status(403).json({ error: "Invalid image token" });
    }

    try {
      const object = await createS3Client().send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );

      if (!object.Body) {
        return res.status(404).json({ error: "Image not found" });
      }

      res.setHeader(
        "Content-Type",
        object.ContentType ?? "application/octet-stream",
      );
      if (object.ContentLength !== undefined) {
        res.setHeader("Content-Length", object.ContentLength);
      }
      // The key is immutable: a new upload gets a new key.
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

      (object.Body as Readable).pipe(res);

      return await new Promise<void>((resolve, reject) => {
        res.on("finish", resolve);
        res.on("error", reject);
      });
    } catch {
      return res.status(404).json({ error: "Image not found" });
    }
  }),
);
