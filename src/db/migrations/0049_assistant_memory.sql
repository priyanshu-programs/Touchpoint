CREATE TABLE "ai_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"contact_id" uuid,
	"organization_id" uuid,
	"content" text NOT NULL,
	"terms" text,
	"source" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "ai_memories"."content") || to_tsvector('simple', coalesce("ai_memories"."terms", ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_memories_scope_check" CHECK ("ai_memories"."scope" in ('you', 'person', 'company')),
	CONSTRAINT "ai_memories_source_check" CHECK ("ai_memories"."source" in ('ai', 'user')),
	CONSTRAINT "ai_memories_record_check" CHECK (("ai_memories"."scope" = 'you' and "ai_memories"."contact_id" is null and "ai_memories"."organization_id" is null)
        or ("ai_memories"."scope" = 'person' and "ai_memories"."contact_id" is not null and "ai_memories"."organization_id" is null)
        or ("ai_memories"."scope" = 'company' and "ai_memories"."organization_id" is not null and "ai_memories"."contact_id" is null)),
	CONSTRAINT "ai_memories_length_check" CHECK (char_length("ai_memories"."content") between 1 and 500
        and char_length(coalesce("ai_memories"."terms", '')) <= 200)
);
--> statement-breakpoint
ALTER TABLE "ai_tool_executions" DROP CONSTRAINT "ai_tool_executions_tool_check";--> statement-breakpoint
ALTER TABLE "ai_settings" ADD COLUMN "memories_tidied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_memories_owner_scope_idx" ON "ai_memories" USING btree ("owner_id","scope","created_at");--> statement-breakpoint
CREATE INDEX "ai_memories_contact_idx" ON "ai_memories" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "ai_memories_organization_idx" ON "ai_memories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_memories_search_idx" ON "ai_memories" USING gin ("search");--> statement-breakpoint
CREATE INDEX "ai_memories_content_trgm_idx" ON "ai_memories" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "ai_tool_executions" ADD CONSTRAINT "ai_tool_executions_tool_check" CHECK ("ai_tool_executions"."tool" in ('addTask', 'addNote', 'saveMemory', 'scheduleMeeting', 'moveMeeting', 'cancelMeeting'));