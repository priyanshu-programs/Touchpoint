CREATE TABLE "workflow_template_edges" (
	"owner_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"from_stage_id" uuid NOT NULL,
	"to_stage_id" uuid NOT NULL,
	CONSTRAINT "workflow_template_edges_from_stage_id_to_stage_id_pk" PRIMARY KEY("from_stage_id","to_stage_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_template_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer NOT NULL,
	"kind" text DEFAULT 'normal' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sla_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_template_stages_kind_check" CHECK ("workflow_template_stages"."kind" in ('normal', 'won', 'lost', 'done')),
	CONSTRAINT "workflow_template_stages_sla_days_check" CHECK ("workflow_template_stages"."sla_days" is null or "workflow_template_stages"."sla_days" > 0)
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" "citext" NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"starter_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workflow_template_edges" ADD CONSTRAINT "workflow_template_edges_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template_edges" ADD CONSTRAINT "workflow_template_edges_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template_edges" ADD CONSTRAINT "workflow_template_edges_from_stage_id_workflow_template_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."workflow_template_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template_edges" ADD CONSTRAINT "workflow_template_edges_to_stage_id_workflow_template_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."workflow_template_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template_stages" ADD CONSTRAINT "workflow_template_stages_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template_stages" ADD CONSTRAINT "workflow_template_stages_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_template_edges_template_idx" ON "workflow_template_edges" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "workflow_template_stages_template_idx" ON "workflow_template_stages" USING btree ("template_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_templates_owner_name_idx" ON "workflow_templates" USING btree ("owner_id","name");