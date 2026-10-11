import {
  CONTACT_STATUSES,
  PREFERRED_CHANNELS,
  RELATIONSHIP_TYPES,
} from "@/modules/contacts/schema";
import { TIMEZONES } from "@/modules/settings/schema";
import { toOptions } from "../labels";

// A saved alias such as Asia/Kolkata is not in the runtime's list and must stay selectable.
export function contactFormOptions(currentTimezone?: string | null) {
  const timezones =
    currentTimezone && !TIMEZONES.includes(currentTimezone)
      ? [currentTimezone, ...TIMEZONES]
      : TIMEZONES;
  return {
    statuses: toOptions(CONTACT_STATUSES),
    relationshipTypes: toOptions(RELATIONSHIP_TYPES),
    channels: toOptions(PREFERRED_CHANNELS),
    timezones: timezones.map((zone) => ({ value: zone, label: zone })),
  };
}
