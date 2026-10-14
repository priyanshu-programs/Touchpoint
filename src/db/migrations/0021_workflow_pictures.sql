CREATE TABLE "workflow_pictures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_pictures" ADD CONSTRAINT "workflow_pictures_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_pictures" ADD CONSTRAINT "workflow_pictures_board_id_workflow_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."workflow_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_pictures" ADD CONSTRAINT "workflow_pictures_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_pictures_board_key_idx" ON "workflow_pictures" USING btree ("board_id","file_key");--> statement-breakpoint
CREATE INDEX "workflow_pictures_file_idx" ON "workflow_pictures" USING btree ("file_id");