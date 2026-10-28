CREATE TABLE "brainstorm_elements" (
	"owner_id" uuid NOT NULL,
	"board_id" uuid NOT NULL,
	"element_id" text NOT NULL,
	"version" integer NOT NULL,
	"version_nonce" integer NOT NULL,
	"deleted" boolean NOT NULL,
	"data" jsonb NOT NULL,
	"size" integer NOT NULL,
	"clock" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brainstorm_elements_board_id_element_id_pk" PRIMARY KEY("board_id","element_id")
);
--> statement-breakpoint
ALTER TABLE "brainstorm_boards" ADD COLUMN "clock" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "brainstorm_boards" ADD COLUMN "live" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "brainstorm_boards" ADD COLUMN "bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "brainstorm_boards" ADD COLUMN "pruned" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "brainstorm_elements" ADD CONSTRAINT "brainstorm_elements_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brainstorm_elements" ADD CONSTRAINT "brainstorm_elements_board_id_brainstorm_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."brainstorm_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brainstorm_elements_board_clock_idx" ON "brainstorm_elements" USING btree ("board_id","clock");--> statement-breakpoint
-- Each board's drawing moves to a row an element, at clock 1.
INSERT INTO "brainstorm_elements" ("owner_id", "board_id", "element_id", "version", "version_nonce", "deleted", "data", "size", "clock")
SELECT "board"."owner_id", "board"."id", "element" ->> 'id',
	coalesce(("element" ->> 'version')::integer, 1),
	coalesce(("element" ->> 'versionNonce')::integer, 0),
	false, "element", octet_length("element"::text), 1
FROM "brainstorm_boards" AS "board", jsonb_array_elements("board"."scene" -> 'elements') AS "element"
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "brainstorm_boards" AS "board"
SET "clock" = 1, "live" = "moved"."live", "bytes" = "moved"."bytes", "scene" = '{"elements": []}'::jsonb
FROM (
	SELECT "board_id", count(*)::integer AS "live", sum("size")::bigint AS "bytes"
	FROM "brainstorm_elements" GROUP BY "board_id"
) AS "moved"
WHERE "moved"."board_id" = "board"."id";
