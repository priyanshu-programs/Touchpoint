import { z } from "zod";

export const googleClientInput = z.strictObject({
  clientId: z
    .string()
    .trim()
    .regex(
      /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
      "That isn't a Google client ID. It ends in .apps.googleusercontent.com.",
    ),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Enter the client secret.")
    .max(200, "That client secret is too long.")
    .regex(/^\S+$/, "A client secret has no spaces in it."),
});
export type GoogleClientInput = z.infer<typeof googleClientInput>;

const localTime = (message: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, message)
    .refine((value) => !Number.isNaN(Date.parse(`${value}:00Z`)), message);

// A box on a form sends "yes", or nothing at all.
const box = z.enum(["", "yes"]).transform((value) => value === "yes");

export const MEETING_LIMITS = { title: 200, location: 500, notes: 2000, people: 20 };
// Each one can email a client.
export const MEETINGS_PER_HOUR = 30;

export const meetingInput = z.strictObject({
  key: z.uuid(),
  title: z
    .string()
    .trim()
    .min(1, "Give the meeting a title.")
    .max(MEETING_LIMITS.title, "That title is too long."),
  startsAt: localTime("Choose when the meeting starts."),
  endsAt: localTime("Choose when the meeting ends."),
  location: z.string().trim().max(MEETING_LIMITS.location, "That location is too long."),
  notes: z.string().trim().max(MEETING_LIMITS.notes, "Those notes are too long."),
  contactIds: z
    .array(z.uuid())
    .min(1, "Choose at least one person to invite.")
    .max(MEETING_LIMITS.people, `A meeting can invite at most ${MEETING_LIMITS.people} people here.`)
    .refine((ids) => new Set(ids).size === ids.length, "Choose each person once."),
  emailGuests: box,
  addMeet: box,
});
export type MeetingInput = z.infer<typeof meetingInput>;
