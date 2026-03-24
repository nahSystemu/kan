DO $$ BEGIN CREATE TYPE "public"."page_visibility" AS ENUM('private', 'public');
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
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
ALTER TABLE "page_label" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
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
ALTER TABLE "page_tag" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
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
ALTER TABLE "page" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_page_labels" (
	"pageId" bigint NOT NULL,
	"labelId" bigint NOT NULL,
	CONSTRAINT "_page_labels_pageId_labelId_pk" PRIMARY KEY("pageId", "labelId")
);
--> statement-breakpoint
ALTER TABLE "_page_labels" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "_page_workspace_members" (
	"pageId" bigint NOT NULL,
	"workspaceMemberId" bigint NOT NULL,
	CONSTRAINT "_page_workspace_members_pageId_workspaceMemberId_pk" PRIMARY KEY("pageId", "workspaceMemberId")
);
--> statement-breakpoint
ALTER TABLE "_page_workspace_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_roles"
ADD COLUMN "color" varchar(7);
--> statement-breakpoint
ALTER TABLE "workspace_roles"
ADD COLUMN "deletedAt" timestamp;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "page_label"
ADD CONSTRAINT "page_label_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "page_label"
ADD CONSTRAINT "page_label_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE
set null ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "page_label"
ADD CONSTRAINT "page_label_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE
set null ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "page_tag"
ADD CONSTRAINT "page_tag_pageId_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "page_tag"
ADD CONSTRAINT "page_tag_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE
set null ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "page_tag"
ADD CONSTRAINT "page_tag_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE
set null ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "page"
ADD CONSTRAINT "page_workspaceId_workspace_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "page"
ADD CONSTRAINT "page_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE
set null ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "page"
ADD CONSTRAINT "page_deletedBy_user_id_fk" FOREIGN KEY ("deletedBy") REFERENCES "public"."user"("id") ON DELETE
set null ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "_page_labels"
ADD CONSTRAINT "_page_labels_pageId_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "_page_labels"
ADD CONSTRAINT "_page_labels_labelId_page_label_id_fk" FOREIGN KEY ("labelId") REFERENCES "public"."page_label"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "_page_workspace_members"
ADD CONSTRAINT "_page_workspace_members_pageId_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "_page_workspace_members"
ADD CONSTRAINT "_page_workspace_members_workspaceMemberId_workspace_members_id_fk" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_visibility_idx" ON "page" USING btree ("visibility");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_workspace_slug_idx" ON "page" USING btree ("workspaceId", "slug");
--> statement-breakpoint
-- Grant role:* permissions to existing workspace roles
INSERT INTO "workspace_role_permissions" ("workspaceRoleId", "permission", "granted")
SELECT wr."id",
	p."permission",
	true
FROM "workspace_roles" wr
	CROSS JOIN (
		SELECT 'role:view' AS "permission"
		UNION ALL
		SELECT 'role:create'
		UNION ALL
		SELECT 'role:edit'
		UNION ALL
		SELECT 'role:delete'
	) p
WHERE wr."name" = 'admin'
	AND wr."isSystem" = true
	AND NOT EXISTS (
		SELECT 1
		FROM "workspace_role_permissions" wrp
		WHERE wrp."workspaceRoleId" = wr."id"
			AND wrp."permission" = p."permission"
	);
--> statement-breakpoint
INSERT INTO "workspace_role_permissions" ("workspaceRoleId", "permission", "granted")
SELECT wr."id",
	'role:view',
	true
FROM "workspace_roles" wr
WHERE wr."name" IN ('member', 'guest')
	AND wr."isSystem" = true
	AND NOT EXISTS (
		SELECT 1
		FROM "workspace_role_permissions" wrp
		WHERE wrp."workspaceRoleId" = wr."id"
			AND wrp."permission" = 'role:view'
	);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_page_slug_global" ON "page" USING btree ("slug")
WHERE "page"."deletedAt" IS NULL;
--> statement-breakpoint
UPDATE "workspace_roles"
SET "color" = '#ef4444'
WHERE "name" = 'admin'
	AND "isSystem" = true
	AND "color" IS NULL;
--> statement-breakpoint
UPDATE "workspace_roles"
SET "color" = '#22c55e'
WHERE "name" = 'member'
	AND "isSystem" = true
	AND "color" IS NULL;
--> statement-breakpoint
UPDATE "workspace_roles"
SET "color" = '#6b7280'
WHERE "name" = 'guest'
	AND "isSystem" = true
	AND "color" IS NULL;
