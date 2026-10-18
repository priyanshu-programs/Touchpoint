CREATE TABLE "material_send_recipients" (
	"send_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	CONSTRAINT "material_send_recipients_send_id_contact_id_pk" PRIMARY KEY("send_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "material_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"organization_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_sends_channel_check" CHECK ("material_sends"."channel" in ('email', 'whatsapp', 'linkedin', 'in_person', 'other')),
	CONSTRAINT "material_sends_status_check" CHECK ("material_sends"."status" in ('sent', 'viewed', 'accepted', 'rejected', 'superseded'))
);
--> statement-breakpoint
DROP VIEW "public"."timeline";--> statement-breakpoint
ALTER TABLE "material_send_recipients" ADD CONSTRAINT "material_send_recipients_send_id_material_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."material_sends"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_send_recipients" ADD CONSTRAINT "material_send_recipients_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_send_recipients" ADD CONSTRAINT "material_send_recipients_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_sends" ADD CONSTRAINT "material_sends_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_sends" ADD CONSTRAINT "material_sends_version_id_material_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."material_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_sends" ADD CONSTRAINT "material_sends_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_send_recipients_contact_idx" ON "material_send_recipients" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "material_sends_version_idx" ON "material_sends" USING btree ("version_id");--> statement-breakpoint
CREATE INDEX "material_sends_owner_sent_idx" ON "material_sends" USING btree ("owner_id","sent_at","id");--> statement-breakpoint
CREATE INDEX "material_sends_organization_idx" ON "material_sends" USING btree ("organization_id");--> statement-breakpoint
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
    ) as contact_ids,
    null::uuid as material_id,
    null::text as status
  from activities a
  union all
  select
    s.owner_id,
    'material_send'::text as event_type,
    s.id as event_id,
    s.sent_at as occurred_at,
    s.channel as kind,
    null::text as direction,
    m.name::text || ' · ' || v.label as title,
    s.note as body,
    null::text as outcome,
    s.organization_id,
    array(
      select r.contact_id from material_send_recipients r where r.send_id = s.id
    ) as contact_ids,
    m.id as material_id,
    s.status
  from material_sends s
  join material_versions v on v.id = s.version_id
  join materials m on m.id = v.material_id
);