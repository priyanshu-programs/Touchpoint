ALTER TABLE "brainstorm_boards" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "brainstorm_boards" AS board
SET "position" = ranked.place
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "owner_id" ORDER BY "updated_at" DESC, "id" ASC) - 1 AS place
  FROM "brainstorm_boards"
) AS ranked
WHERE board."id" = ranked."id";--> statement-breakpoint
CREATE INDEX "brainstorm_boards_owner_position_idx" ON "brainstorm_boards" USING btree ("owner_id","position");
