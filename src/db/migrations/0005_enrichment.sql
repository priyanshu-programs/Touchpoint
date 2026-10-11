CREATE TABLE "enrichment_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"provider" text DEFAULT 'website' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"raw_result" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enrichment_runs_status_check" CHECK ("enrichment_runs"."status" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "field_provenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"source" text NOT NULL,
	"confidence" text NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_id" uuid,
	CONSTRAINT "field_provenance_source_check" CHECK ("field_provenance"."source" in ('manual', 'website')),
	CONSTRAINT "field_provenance_confidence_check" CHECK ("field_provenance"."confidence" in ('verified', 'inferred'))
);
--> statement-breakpoint
CREATE TABLE "organization_logos" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"source_url" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrichment_runs" ADD CONSTRAINT "enrichment_runs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrichment_runs" ADD CONSTRAINT "enrichment_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_provenance" ADD CONSTRAINT "field_provenance_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_provenance" ADD CONSTRAINT "field_provenance_run_id_enrichment_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."enrichment_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_logos" ADD CONSTRAINT "organization_logos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_logos" ADD CONSTRAINT "organization_logos_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrichment_runs_organization_idx" ON "enrichment_runs" USING btree ("owner_id","organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "field_provenance_field_idx" ON "field_provenance" USING btree ("owner_id","entity_type","entity_id","field");