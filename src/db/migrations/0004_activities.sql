CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"direction" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"outcome" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_kind_check" CHECK ("activities"."kind" in ('note', 'call', 'meeting', 'email', 'linkedin', 'message', 'decision', 'objection', 'commitment')),
	CONSTRAINT "activities_direction_check" CHECK ("activities"."direction" in ('inbound', 'outbound')),
	CONSTRAINT "activities_source_check" CHECK ("activities"."source" in ('manual', 'gmail', 'calendar', 'ai'))
);
--> statement-breakpoint
CREATE TABLE "activity_contacts" (
	"activity_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	CONSTRAINT "activity_contacts_activity_id_contact_id_pk" PRIMARY KEY("activity_id","contact_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_contacts" ADD CONSTRAINT "activity_contacts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_contacts" ADD CONSTRAINT "activity_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_contacts" ADD CONSTRAINT "activity_contacts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_owner_occurred_idx" ON "activities" USING btree ("owner_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "activities_organization_idx" ON "activities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "activity_contacts_contact_idx" ON "activity_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE VIEW "public"."timeline" AS (
  select
    a.owner_id,
    'activity'::text as event_type,
    a.id as event_id,
    a.occurred_at,
    a.kind,
    a.direction,
    a.title,
    a.body,
    a.outcome,
    a.organization_id,
    array(
      select ac.contact_id from activity_contacts ac where ac.activity_id = a.id
    ) as contact_ids
  from activities a
);