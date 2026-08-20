ALTER TYPE "public"."card_activity_type" ADD VALUE 'card.unarchived';--> statement-breakpoint
ALTER TABLE "card" ADD COLUMN "isArchived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "list" ADD COLUMN "isCompleted" boolean DEFAULT false NOT NULL;