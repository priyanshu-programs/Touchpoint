CREATE TABLE "contact_organizations" (
	"contact_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"job_title" text,
	"listed_as" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_organizations_contact_id_organization_id_pk" PRIMARY KEY("contact_id","organization_id")
);
--> statement-breakpoint
-- Written by hand: every person keeps the company and the star they had before the columns go.
INSERT INTO "contact_organizations" ("contact_id", "organization_id", "owner_id", "is_primary")
SELECT "id", "organization_id", "owner_id", "is_primary" FROM "contacts" WHERE "organization_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_organization_id_organizations_id_fk";
--> statement-breakpoint
DROP INDEX "contacts_organization_idx";--> statement-breakpoint
DROP INDEX "contacts_primary_idx";--> statement-breakpoint
ALTER TABLE "contact_organizations" ADD CONSTRAINT "contact_organizations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_organizations" ADD CONSTRAINT "contact_organizations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_organizations" ADD CONSTRAINT "contact_organizations_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_organizations_organization_idx" ON "contact_organizations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_organizations_primary_idx" ON "contact_organizations" USING btree ("organization_id") WHERE "contact_organizations"."is_primary";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "organization_id";--> statement-breakpoint
ALTER TABLE "contacts" DROP COLUMN "is_primary";