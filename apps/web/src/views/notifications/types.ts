import { z } from "zod";

import { notificationTypes } from "@kan/db/schema";

export const notificationItemSchema = z.object({
  publicId: z.string(),
  type: z.enum(notificationTypes),
  entityPublicId: z.string().nullable(),
  payload: z.record(z.unknown()),
  redirectPath: z.string().nullable(),
  createdAt: z.date(),
  readAt: z.date().nullable(),
  seenAt: z.date().nullable(),
  workspace: z.object({
    publicId: z.string(),
    name: z.string(),
  }),
  createdBy: z
    .object({
      id: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      image: z.string().nullable(),
    })
    .nullable(),
});

export const notificationListSchema = z.object({
  items: z.array(notificationItemSchema),
  nextCursor: z.date().nullable(),
});

export type NotificationItem = z.infer<typeof notificationItemSchema>;
export type NotificationListOutput = z.infer<typeof notificationListSchema>;
