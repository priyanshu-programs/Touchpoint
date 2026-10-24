CREATE TABLE "brainstorm_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" "citext" NOT NULL,
	"icon" text,
	"scene" jsonb DEFAULT '{"elements":[]}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brainstorm_boards_icon_check" CHECK ("brainstorm_boards"."icon" ~ '^[a-z0-9-]{1,32}$')
);
--> statement-breakpoint
ALTER TABLE "brainstorm_boards" ADD CONSTRAINT "brainstorm_boards_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brainstorm_boards_owner_name_idx" ON "brainstorm_boards" USING btree ("owner_id","name");--> statement-breakpoint
CREATE INDEX "brainstorm_boards_owner_updated_idx" ON "brainstorm_boards" USING btree ("owner_id","updated_at");