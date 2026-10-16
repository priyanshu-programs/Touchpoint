CREATE TABLE "material_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"label" text NOT NULL,
	"url" text,
	"file_id" uuid,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_versions_target_check" CHECK (num_nonnulls("material_versions"."url", "material_versions"."file_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" "citext" NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_type_check" CHECK ("materials"."type" in ('proposal', 'quote', 'deck', 'portfolio', 'contract', 'report', 'design', 'deliverable', 'link', 'other'))
);
--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_versions" ADD CONSTRAINT "material_versions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "material_versions_material_idx" ON "material_versions" USING btree ("material_id","created_at");--> statement-breakpoint
CREATE INDEX "material_versions_file_idx" ON "material_versions" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_owner_name_idx" ON "materials" USING btree ("owner_id","name");