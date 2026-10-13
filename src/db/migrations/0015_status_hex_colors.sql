ALTER TABLE "company_statuses" DROP CONSTRAINT "company_statuses_color_check";--> statement-breakpoint
-- Written by hand: a colour was one of nine names and is now any hex value, so each name becomes the hex it was drawn in.
UPDATE "company_statuses" SET "color" = CASE "color"
	WHEN 'gray' THEN '#a1a1aa'
	WHEN 'red' THEN '#ef4444'
	WHEN 'orange' THEN '#f97316'
	WHEN 'amber' THEN '#f59e0b'
	WHEN 'green' THEN '#22c55e'
	WHEN 'teal' THEN '#14b8a6'
	WHEN 'blue' THEN '#3b82f6'
	WHEN 'purple' THEN '#a855f7'
	WHEN 'pink' THEN '#ec4899'
	ELSE '#a1a1aa'
END;--> statement-breakpoint
ALTER TABLE "company_statuses" ADD CONSTRAINT "company_statuses_color_check" CHECK ("company_statuses"."color" ~ '^#[0-9a-f]{6}$');
