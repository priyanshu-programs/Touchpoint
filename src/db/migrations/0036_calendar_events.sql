CREATE TABLE "calendar_event_contacts" (
	"event_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	CONSTRAINT "calendar_event_contacts_event_id_contact_id_pk" PRIMARY KEY("event_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"meeting_url" text,
	"html_link" text,
	"all_day" boolean NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"starts_on" date,
	"ends_on" date,
	"timezone" text,
	"attendees" jsonb NOT NULL,
	"organization_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_events_when_check" CHECK (("calendar_events"."all_day" and "calendar_events"."starts_on" is not null and "calendar_events"."ends_on" is not null and "calendar_events"."starts_at" is null and "calendar_events"."ends_at" is null) or (not "calendar_events"."all_day" and "calendar_events"."starts_at" is not null and "calendar_events"."ends_at" is not null and "calendar_events"."starts_on" is null and "calendar_events"."ends_on" is null))
);
--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "last_full_sync_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "last_sync_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_event_contacts" ADD CONSTRAINT "calendar_event_contacts_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_contacts" ADD CONSTRAINT "calendar_event_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_contacts" ADD CONSTRAINT "calendar_event_contacts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_event_contacts_contact_idx" ON "calendar_event_contacts" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_connection_external_idx" ON "calendar_events" USING btree ("connection_id","external_id");--> statement-breakpoint
CREATE INDEX "calendar_events_owner_starts_at_idx" ON "calendar_events" USING btree ("owner_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_events_owner_starts_on_idx" ON "calendar_events" USING btree ("owner_id","starts_on");--> statement-breakpoint
CREATE INDEX "calendar_events_organization_idx" ON "calendar_events" USING btree ("organization_id");