ALTER TABLE "activities" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "activities"."title" || ' ' || coalesce("activities"."body", '') || ' ' || coalesce("activities"."outcome", ''))) STORED;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', "tasks"."title" || ' ' || coalesce("tasks"."notes", ''))) STORED;--> statement-breakpoint
CREATE INDEX "activities_search_idx" ON "activities" USING gin ("search");--> statement-breakpoint
CREATE INDEX "tasks_search_idx" ON "tasks" USING gin ("search");