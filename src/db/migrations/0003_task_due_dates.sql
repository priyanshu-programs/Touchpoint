ALTER TABLE "tasks" DROP CONSTRAINT "tasks_single_due_check";--> statement-breakpoint
-- Timed tasks created under 0002 had no date; give them the owner's calendar date.
UPDATE "tasks" SET "due_on" = ("tasks"."due_at" AT TIME ZONE "settings"."timezone")::date
FROM "settings"
WHERE "settings"."owner_id" = "tasks"."owner_id" AND "tasks"."due_at" IS NOT NULL AND "tasks"."due_on" IS NULL;--> statement-breakpoint
DROP INDEX "tasks_owner_status_idx";--> statement-breakpoint
CREATE INDEX "tasks_owner_status_due_idx" ON "tasks" USING btree ("owner_id","status","due_on");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_due_time_has_date_check" CHECK ("tasks"."due_at" is null or "tasks"."due_on" is not null);
