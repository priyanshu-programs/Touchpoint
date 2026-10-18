import {
  MATERIAL_TYPE_LABELS,
  MATERIAL_TYPES,
  SEND_CHANNEL_LABELS,
  SEND_CHANNELS,
  SEND_STATUS_LABELS,
  SEND_STATUSES,
  type MaterialListParams,
} from "@/modules/materials/schema";

export const materialTypeOptions = MATERIAL_TYPES.map((value) => ({
  value,
  label: MATERIAL_TYPE_LABELS[value],
}));

export const materialHref = (id: string) => `/materials/${id}`;

export function materialsHref(
  params: MaterialListParams,
  change: Partial<MaterialListParams> = {},
) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...change })) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return `/materials${query ? `?${query}` : ""}`;
}

// Why a version was not added, as the Versions card says it.
export const VERSION_REFUSALS = {
  limit: "A material holds at most 50 versions. Remove one you no longer need first.",
  too_large: "That file is larger than 4 MB. Add it as a link instead.",
  kind: "Only PDFs, pictures and Word, Excel and PowerPoint files are kept. Add anything else as a link.",
  full: "Your 200 MB of file storage is used up. Remove a file, or add this one as a link.",
  rate: "Too many uploads in a minute. Try again shortly.",
  label: "Give the version a label of up to 100 characters, such as v1.",
} as const;

// Why a send was not logged, as its form says it.
export const SEND_REFUSALS = {
  unknown_version: "Choose a material and a version from the list.",
  unknown_contact: "Choose people from the list.",
  unknown_organization: "Choose a company from the list.",
  rate: "Too many sends logged in a minute. Try again shortly.",
} as const;

export const sendChannelOptions = SEND_CHANNELS.map((value) => ({
  value,
  label: SEND_CHANNEL_LABELS[value],
}));

export const sendStatusOptions = SEND_STATUSES.map((value) => ({
  value,
  label: SEND_STATUS_LABELS[value],
}));
