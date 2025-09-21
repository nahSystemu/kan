CREATE TYPE "public"."page_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_label" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"name" varchar(255) NOT NULL,
	"colourCode" varchar(12),
	"workspaceId" bigint NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "page_label_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "page_label" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_tag" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"name" varchar(255) NOT NULL,
	"colourCode" varchar(12),
	"pageId" bigint NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	CONSTRAINT "page_tag_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "page_tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"publicId" varchar(12) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"slug" varchar(255),
	"workspaceId" bigint NOT NULL,
	"createdBy" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp,
	"deletedBy" uuid,
	"visibility" "page_visibility" DEFAULT 'private' NOT NULL,
	CONSTRAINT "page_publicId_unique" UNIQUE("publicId")
);
--> statement-breakpoint
ALTER TABLE "page" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_page_labels" (
	"pageId" bigint NOT NULL,
	"labelId" bigint NOT NULL,
	CONSTRAINT "_page_labels_pageId_labelId_pk" PRIMARY KEY("pageId","labelId")
);
--> statement-breakpoint
ALTER TABLE "_page_labels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_label" ADD CONSTRAINT "page_label_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_label" ADD CONSTRAINT "page_label_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_label" ADD CONSTRAINT "page_label_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_tag" ADD CONSTRAINT "page_tag_pageId_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_tag" ADD CONSTRAINT "page_tag_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page_tag" ADD CONSTRAINT "page_tag_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page" ADD CONSTRAINT "page_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page" ADD CONSTRAINT "page_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "page" ADD CONSTRAINT "page_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_page_labels" ADD CONSTRAINT "_page_labels_pageId_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_page_labels" ADD CONSTRAINT "_page_labels_labelId_page_label_id_fk" FOREIGN KEY ("labelId") REFERENCES "public"."page_label"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_visibility_idx" ON "page" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_workspace_slug_idx" ON "page" USING btree ("workspaceId","slug");