ALTER TYPE "public"."card_activity_type" ADD VALUE IF NOT EXISTS 'card.unarchived';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE IF NOT EXISTS 'card.deleted';--> statement-breakpoint
ALTER TYPE "public"."card_activity_type" ADD VALUE IF NOT EXISTS 'card.restored';--> statement-breakpoint
ALTER TABLE "card" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp;--> statement-breakpoint
ALTER TABLE "card" ADD COLUMN IF NOT EXISTS "archivedBy" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "card" ADD CONSTRAINT "card_archivedBy_user_id_fk" FOREIGN KEY ("archivedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
