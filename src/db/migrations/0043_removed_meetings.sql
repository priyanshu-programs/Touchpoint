CREATE TABLE "removed_calendar_events" (
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "removed_calendar_events_connection_id_external_id_pk" PRIMARY KEY("connection_id","external_id")
);
--> statement-breakpoint
ALTER TABLE "removed_calendar_events" ADD CONSTRAINT "removed_calendar_events_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "removed_calendar_events" ADD CONSTRAINT "removed_calendar_events_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;