CREATE TABLE "profile_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" text NOT NULL,
	"results" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_searches_status_check" CHECK ("profile_searches"."status" in ('done', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "profile_searches" ADD CONSTRAINT "profile_searches_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_searches" ADD CONSTRAINT "profile_searches_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "profile_searches_contact_idx" ON "profile_searches" USING btree ("owner_id","contact_id","created_at" DESC NULLS LAST);