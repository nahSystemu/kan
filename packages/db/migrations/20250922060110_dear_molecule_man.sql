CREATE TABLE IF NOT EXISTS "_page_workspace_members" (
	"pageId" bigint NOT NULL,
	"workspaceMemberId" bigint NOT NULL,
	CONSTRAINT "_page_workspace_members_pageId_workspaceMemberId_pk" PRIMARY KEY("pageId","workspaceMemberId")
);
--> statement-breakpoint
ALTER TABLE "_page_workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_page_workspace_members" ADD CONSTRAINT "_page_workspace_members_pageId_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "_page_workspace_members" ADD CONSTRAINT "_page_workspace_members_workspaceMemberId_workspace_members_id_fk" FOREIGN KEY ("workspaceMemberId") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
