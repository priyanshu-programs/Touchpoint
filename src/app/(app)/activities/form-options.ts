import {
  ACTIVITY_DIRECTIONS,
  ACTIVITY_KINDS,
} from "@/modules/activities/schema";
import { toOptions } from "../people/labels";

export const activityFormOptions = {
  kinds: toOptions(ACTIVITY_KINDS),
  directions: toOptions(ACTIVITY_DIRECTIONS),
};
