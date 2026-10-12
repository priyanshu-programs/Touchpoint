CREATE TABLE "field_layouts" (
	"owner_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"fields" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_layouts_owner_id_entity_type_pk" PRIMARY KEY("owner_id","entity_type"),
	CONSTRAINT "field_layouts_entity_type_check" CHECK ("field_layouts"."entity_type" in ('organization', 'contact'))
);
--> statement-breakpoint
ALTER TABLE "field_layouts" ADD CONSTRAINT "field_layouts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;