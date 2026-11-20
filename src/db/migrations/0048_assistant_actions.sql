CREATE TABLE "ai_tool_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"tier" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb NOT NULL,
	"summary" text NOT NULL,
	"result_id" uuid,
	"problem" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "ai_tool_executions_tool_check" CHECK ("ai_tool_executions"."tool" in ('addTask', 'addNote', 'scheduleMeeting', 'moveMeeting', 'cancelMeeting')),
	CONSTRAINT "ai_tool_executions_tier_check" CHECK ("ai_tool_executions"."tier" in ('undo', 'confirm')),
	CONSTRAINT "ai_tool_executions_status_check" CHECK ("ai_tool_executions"."status" in ('waiting', 'running', 'done', 'declined', 'undone'))
);
--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD COLUMN "read_untrusted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_tool_executions" ADD CONSTRAINT "ai_tool_executions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tool_executions" ADD CONSTRAINT "ai_tool_executions_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tool_executions_conversation_idx" ON "ai_tool_executions" USING btree ("conversation_id","created_at");