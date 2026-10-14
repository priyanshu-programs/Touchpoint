CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"element_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_attachments_target_check" CHECK (num_nonnulls("workflow_attachments"."url", "workflow_attachments"."file_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_attachments" ADD CONSTRAINT "workflow_attachments_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_attachments" ADD CONSTRAINT "workflow_attachments_board_id_workflow_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."workflow_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_attachments" ADD CONSTRAINT "workflow_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "files_owner_sha256_idx" ON "files" USING btree ("owner_id","sha256");--> statement-breakpoint
CREATE INDEX "workflow_attachments_board_idx" ON "workflow_attachments" USING btree ("board_id","element_id");--> statement-breakpoint
CREATE INDEX "workflow_attachments_file_idx" ON "workflow_attachments" USING btree ("file_id");