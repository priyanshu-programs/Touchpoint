CREATE TABLE "brainstorm_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" "citext" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brainstorm_boards" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "brainstorm_folders" ADD CONSTRAINT "brainstorm_folders_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brainstorm_folders_owner_name_idx" ON "brainstorm_folders" USING btree ("owner_id","name");--> statement-breakpoint
ALTER TABLE "brainstorm_boards" ADD CONSTRAINT "brainstorm_boards_folder_id_brainstorm_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."brainstorm_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brainstorm_boards_folder_idx" ON "brainstorm_boards" USING btree ("folder_id");