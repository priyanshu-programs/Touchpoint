ALTER TABLE "settings" ADD COLUMN "task_color_low" varchar(7);--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "task_color_normal" varchar(7);--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "task_color_high" varchar(7);--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_task_colors_check" CHECK ("settings"."task_color_low" ~ '^#[0-9a-f]{6}$' and "settings"."task_color_normal" ~ '^#[0-9a-f]{6}$' and "settings"."task_color_high" ~ '^#[0-9a-f]{6}$');