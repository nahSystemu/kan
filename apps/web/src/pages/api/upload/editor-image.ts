import type { NextApiRequest, NextApiResponse } from "next";
import { Upload } from "@aws-sdk/lib-storage";

import { createNextApiContext } from "@kan/api/trpc";
import { withApiLogging } from "@kan/api/utils/apiLogging";
import { hasPermission } from "@kan/api/utils/permissions";
import { withRateLimit } from "@kan/api/utils/rateLimit";
import * as workspaceRepo from "@kan/db/repository/workspace.repo";
import { createS3Client, generateUID } from "@kan/shared/utils";

import { env } from "~/env";
import { buildEditorImageUrl } from "~/server/editorImage";

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

// SVG is excluded on purpose: the proxy serves these inline, and an SVG can
// carry script.
const allowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
];

export const config = {
  api: {
    bodyParser: false,
  },
};

export default withRateLimit(
  { points: 100, duration: 60 },
  withApiLogging(async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    try {
      const { user, db } = await createNextApiContext(req);

      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const bucket = env.NEXT_PUBLIC_ATTACHMENTS_BUCKET_NAME;
      if (!bucket) {
        return res
          .status(500)
          .json({ error: "Attachments bucket not configured" });
      }

      const workspacePublicId = req.query.workspacePublicId;
      if (
        typeof workspacePublicId !== "string" ||
        workspacePublicId.length < 12
      ) {
        return res.status(400).json({ error: "Invalid workspacePublicId" });
      }

      const contentType = req.headers["content-type"];
      const contentLengthHeader = req.headers["content-length"];
      const contentLength = contentLengthHeader
        ? Number.parseInt(contentLengthHeader, 10)
        : NaN;

      if (
        typeof contentType !== "string" ||
        !allowedContentTypes.includes(contentType)
      ) {
        return res.status(400).json({ error: "Unsupported image type" });
      }

      if (!Number.isFinite(contentLength) || contentLength <= 0) {
        return res
          .status(400)
          .json({ error: "Missing or invalid content length" });
      }

      if (contentLength > MAX_SIZE_BYTES) {
        return res.status(400).json({ error: "File too large" });
      }

      const workspace = await workspaceRepo.getByPublicId(
        db,
        workspacePublicId,
      );

      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }

      // The same editor backs card descriptions, pages and comments, so accept
      // either of the permissions that let a member author that content.
      const canUpload =
        (await hasPermission(db, user.id, workspace.id, "card:edit")) ||
        (await hasPermission(db, user.id, workspace.id, "comment:create"));

      if (!canUpload) {
        return res.status(403).json({ error: "Permission denied" });
      }

      const rawFilenameHeader =
        (req.headers["x-original-filename"] as string | undefined) ?? "image";
      const originalFilename = (() => {
        try {
          return decodeURIComponent(rawFilenameHeader);
        } catch {
          return rawFilenameHeader;
        }
      })();

      const sanitizedFilename = originalFilename
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .substring(0, 200);

      const s3Key = `${workspace.id}/editor/${generateUID()}-${sanitizedFilename}`;

      const upload = new Upload({
        client: createS3Client(),
        params: {
          Bucket: bucket,
          Key: s3Key,
          Body: req,
          ContentType: contentType,
          ContentLength: contentLength,
        },
        leavePartsOnError: false,
      });

      await upload.done();

      return res.status(200).json({ url: buildEditorImageUrl(s3Key) });
    } catch {
      return res.status(500).json({ error: "Internal server error" });
    }
  }),
);
