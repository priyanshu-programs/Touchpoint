CREATE TABLE "workflow_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" "citext" NOT NULL,
	"description" text,
	"scene" jsonb DEFAULT '{"elements":[]}'::jsonb NOT NULL,
	"stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"starter_key" text,
	"source_board_id" uuid,
	"organization_id" uuid,
	"contact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_boards_subject_check" CHECK (num_nonnulls("workflow_boards"."organization_id", "workflow_boards"."contact_id") <= 1)
);
--> statement-breakpoint
ALTER TABLE "workflow_boards" ADD CONSTRAINT "workflow_boards_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_boards" ADD CONSTRAINT "workflow_boards_source_board_id_workflow_boards_id_fk" FOREIGN KEY ("source_board_id") REFERENCES "public"."workflow_boards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_boards" ADD CONSTRAINT "workflow_boards_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_boards" ADD CONSTRAINT "workflow_boards_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_boards_template_name_idx" ON "workflow_boards" USING btree ("owner_id","name") WHERE "workflow_boards"."organization_id" is null and "workflow_boards"."contact_id" is null;--> statement-breakpoint
CREATE INDEX "workflow_boards_organization_idx" ON "workflow_boards" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workflow_boards_contact_idx" ON "workflow_boards" USING btree ("contact_id");