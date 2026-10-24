import { brainstormBoards, brainstormPictures } from "@/db/schema";
import { boardPictures } from "@/modules/workflows/pictures";

export const { addPicture, openPictures, getPicture } = boardPictures({
  boards: brainstormBoards,
  pictures: brainstormPictures,
  entityType: "brainstorm",
});
