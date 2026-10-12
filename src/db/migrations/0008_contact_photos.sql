CREATE TABLE "contact_photos" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"source_url" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_photos" ADD CONSTRAINT "contact_photos_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_photos" ADD CONSTRAINT "contact_photos_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;