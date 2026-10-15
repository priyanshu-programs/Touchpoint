ALTER TABLE "workflow_boards" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "workflow_boards" ADD COLUMN "starred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_boards_organization_star_idx" ON "workflow_boards" USING btree ("organization_id") WHERE "workflow_boards"."starred" and "workflow_boards"."organization_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_boards_contact_star_idx" ON "workflow_boards" USING btree ("contact_id") WHERE "workflow_boards"."starred" and "workflow_boards"."contact_id" is not null;--> statement-breakpoint
ALTER TABLE "workflow_boards" ADD CONSTRAINT "workflow_boards_icon_check" CHECK ("workflow_boards"."icon" ~ '^[a-z0-9-]{1,32}$');--> statement-breakpoint
ALTER TABLE "workflow_boards" ADD CONSTRAINT "workflow_boards_starred_check" CHECK (not "workflow_boards"."starred" or num_nonnulls("workflow_boards"."organization_id", "workflow_boards"."contact_id") = 1);