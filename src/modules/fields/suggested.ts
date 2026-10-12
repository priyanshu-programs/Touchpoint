import type { CustomFieldType, EntityType } from "./schema";

export type SuggestedField = {
  key: string;
  label: string;
  type: CustomFieldType;
  options: readonly string[];
};

// Fields offered in one click. A suggestion is added by its key from this list,
// so what it becomes is decided here and not by the request.
export const SUGGESTED_FIELDS: Record<EntityType, readonly SuggestedField[]> = {
  organization: [
    {
      key: "segment",
      label: "Segment",
      type: "select",
      options: ["Enterprise", "Mid-Market", "SMB"],
    },
    {
      key: "territory",
      label: "Territory",
      type: "select",
      options: ["AMER", "EMEA", "APAC"],
    },
    {
      key: "lifecycle_stage",
      label: "Lifecycle stage",
      type: "select",
      options: ["Lead", "MQL", "SQL", "Opportunity", "Customer"],
    },
    {
      key: "lead_source",
      label: "Lead source",
      type: "select",
      options: ["Inbound", "Outbound", "Event"],
    },
    { key: "icp_fit_score", label: "ICP fit score", type: "number", options: [] },
  ],
  contact: [],
};
