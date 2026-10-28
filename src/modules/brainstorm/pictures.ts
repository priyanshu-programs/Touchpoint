import { sql } from "drizzle-orm";
import { brainstormBoards, brainstormElements, brainstormPictures } from "@/db/schema";
import { boardPictures } from "@/modules/workflows/pictures";

export const { addPicture, openPictures, getPicture } = boardPictures({
  boards: brainstormBoards,
  pictures: brainstormPictures,
  entityType: "brainstorm",
  shown: (boardId, key) => sql`exists (
    select 1
    from ${brainstormElements} as element
    where element.board_id = ${boardId}
      and not element.deleted
      and element.data ->> 'type' = 'image'
      and element.data ->> 'fileId' = ${key}
  )`,
});
