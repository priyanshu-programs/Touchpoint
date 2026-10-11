ALTER TABLE "contact_links" DROP CONSTRAINT "contact_links_kind_check";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "is_primary" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_primary_idx" ON "contacts" USING btree ("organization_id") WHERE "contacts"."is_primary";--> statement-breakpoint
ALTER TABLE "contact_links" ADD CONSTRAINT "contact_links_kind_check" CHECK ("contact_links"."kind" in ('linkedin', 'x', 'github', 'website', 'other'));