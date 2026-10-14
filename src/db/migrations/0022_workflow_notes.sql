CREATE TABLE "workflow_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"element_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_notes" ADD CONSTRAINT "workflow_notes_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_notes" ADD CONSTRAINT "workflow_notes_board_id_workflow_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."workflow_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_notes_board_idx" ON "workflow_notes" USING btree ("board_id","element_id");