CREATE TABLE "company_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_statuses_color_check" CHECK ("company_statuses"."color" in ('gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'purple', 'pink'))
);
--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_status_check";--> statement-breakpoint
ALTER TABLE "company_statuses" ADD CONSTRAINT "company_statuses_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_statuses_owner_key_idx" ON "company_statuses" USING btree ("owner_id","key");