CREATE TABLE "activity_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "marks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "calendar_event_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_files" ADD CONSTRAINT "activity_files_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_files" ADD CONSTRAINT "activity_files_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_files" ADD CONSTRAINT "activity_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_files_activity_idx" ON "activity_files" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "activity_files_file_idx" ON "activity_files" USING btree ("file_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activities_owner_calendar_event_idx" ON "activities" USING btree ("owner_id","calendar_event_id") WHERE "activities"."calendar_event_id" is not null;