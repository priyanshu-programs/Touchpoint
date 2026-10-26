CREATE TABLE "invoice_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"reason" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	CONSTRAINT "invoice_adjustments_amount_check" CHECK ("invoice_adjustments"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unit_amount_minor" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"service_category" text,
	CONSTRAINT "invoice_lines_quantity_check" CHECK ("invoice_lines"."quantity" > 0),
	CONSTRAINT "invoice_lines_unit_check" CHECK ("invoice_lines"."unit_amount_minor" >= 0),
	CONSTRAINT "invoice_lines_amount_check" CHECK ("invoice_lines"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"number" "citext" NOT NULL,
	"organization_id" uuid,
	"contact_id" uuid,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"file_id" uuid,
	"file_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_status_check" CHECK ("invoices"."status" in ('draft', 'issued', 'void')),
	CONSTRAINT "invoices_currency_check" CHECK ("invoices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "invoices_client_check" CHECK (num_nonnulls("invoices"."organization_id", "invoices"."contact_id") = 1),
	CONSTRAINT "invoices_dates_check" CHECK ("invoices"."due_date" >= "invoices"."issue_date"),
	CONSTRAINT "invoices_file_check" CHECK (("invoices"."file_id" is null) = ("invoices"."file_name" is null))
);
--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_adjustments_position_idx" ON "invoice_adjustments" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_lines_position_idx" ON "invoice_lines" USING btree ("invoice_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_owner_number_idx" ON "invoices" USING btree ("owner_id","number");--> statement-breakpoint
CREATE INDEX "invoices_owner_issue_idx" ON "invoices" USING btree ("owner_id","issue_date");--> statement-breakpoint
CREATE INDEX "invoices_organization_idx" ON "invoices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invoices_contact_idx" ON "invoices" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "invoices_file_idx" ON "invoices" USING btree ("file_id");