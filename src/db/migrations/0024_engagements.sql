CREATE TABLE "engagement_contacts" (
	"engagement_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_contacts_engagement_id_contact_id_pk" PRIMARY KEY("engagement_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "engagements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"scope" text,
	"objectives" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"value_minor" bigint,
	"currency" text NOT NULL,
	"payment_terms" text,
	"start_date" date,
	"target_end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagements_status_check" CHECK ("engagements"."status" in ('planned', 'active', 'paused', 'completed', 'cancelled')),
	CONSTRAINT "engagements_currency_check" CHECK ("engagements"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "engagements_value_check" CHECK ("engagements"."value_minor" is null or "engagements"."value_minor" >= 0),
	CONSTRAINT "engagements_dates_check" CHECK ("engagements"."start_date" is null or "engagements"."target_end_date" is null or "engagements"."target_end_date" >= "engagements"."start_date")
);
--> statement-breakpoint
ALTER TABLE "engagement_contacts" ADD CONSTRAINT "engagement_contacts_engagement_id_engagements_id_fk" FOREIGN KEY ("engagement_id") REFERENCES "public"."engagements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_contacts" ADD CONSTRAINT "engagement_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagements" ADD CONSTRAINT "engagements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "engagement_contacts_contact_idx" ON "engagement_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "engagements_owner_status_idx" ON "engagements" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "engagements_organization_idx" ON "engagements" USING btree ("organization_id");