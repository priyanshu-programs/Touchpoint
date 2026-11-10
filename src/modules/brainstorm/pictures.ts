import { sql } from "drizzle-orm";
import { brainstormBoards, brainstormElements, brainstormPictures } from "@/db/schema";
import { boardPictures } from "@/modules/workflows/pictures";
import { MAX_BRAINSTORM_PICTURES } from "@/modules/workflows/drawing";

export const { addPicture, openPictures, getPicture } = boardPictures({
  boards: brainstormBoards,
  pictures: brainstormPictures,
  entityType: "brainstorm",
  maxPictures: MAX_BRAINSTORM_PICTURES,
  shown: (boardId, key) => sql`exists (
    select 1
    from ${brainstormElements} as element
    where element.board_id = ${boardId}
      and not element.deleted
      and element.data ->> 'type' = 'image'
      and element.data ->> 'fileId' = ${key}
  )`,
});
