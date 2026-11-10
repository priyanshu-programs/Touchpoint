// Voice notes on a brainstorm board: their limits, the mark a card carries, and
// the names their files are saved under. Nothing here touches the browser or the
// database, so the board and the server read them alike.

import { z } from "zod";

// Opus at 24 kbps is about 180 KB a minute, AAC at 32 kbps about 240 KB.
export const MAX_VOICE_SECONDS = 180;
export const VOICE_WARN_SECONDS = 150;
export const MAX_VOICE_BYTES = 1024 * 1024;
export const MAX_BOARD_VOICE_NOTES = 30;
export const VOICE_NOTES_PER_MINUTE = 6;
// Every voice note of the owner's together, inside the files' own 200 MB.
export const MAX_VOICE_STORED_BYTES = 50 * 1024 * 1024;
export const MAX_VOICE_TITLE = 80;

export const voiceKey = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const voiceTitle = z
  .string()
  .trim()
  .min(1, "Give the voice note a heading")
  .max(MAX_VOICE_TITLE, `Keep the heading to ${MAX_VOICE_TITLE} characters`);

export const voiceRef = z.strictObject({ boardId: z.uuid(), key: voiceKey });
export type VoiceRef = z.infer<typeof voiceRef>;

export const AUDIO_FORMATS = ["webm", "m4a"] as const;
export type AudioFormat = (typeof AUDIO_FORMATS)[number];

// What a card on the board carries: the recording it plays, its heading, how
// long it runs, and the kind of file it was recorded as, for its file's name.
export const voiceMark = z.strictObject({
  key: voiceKey,
  title: voiceTitle,
  seconds: z.number().int().min(0).max(MAX_VOICE_SECONDS),
  format: z.enum(AUDIO_FORMATS),
});
export type VoiceMark = z.infer<typeof voiceMark>;

export type VoiceCard = VoiceMark & {
  id: string;
  version: number;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
};

type Drawn = Omit<VoiceCard, keyof VoiceMark> & {
  isDeleted: boolean;
  customData?: Record<string, unknown> | null;
};

type Area = { x: number; y: number; width: number; height: number };

export const voiceOf = (element: { customData?: Record<string, unknown> | null }) => {
  const parsed = voiceMark.safeParse(element.customData?.voice);
  return parsed.success ? parsed.data : null;
};

// The cards on the screen, or partly on it.
export function voiceCards(elements: readonly Drawn[], seen: Area): VoiceCard[] {
  return elements.flatMap((element) => {
    if (element.isDeleted) return [];
    const voice = voiceOf(element);
    if (
      !voice ||
      element.x >= seen.x + seen.width ||
      element.x + element.width <= seen.x ||
      element.y >= seen.y + seen.height ||
      element.y + element.height <= seen.y
    ) {
      return [];
    }
    const { id, version, x, y, width, height, angle } = element;
    return [{ id, version, x, y, width, height, angle, ...voice }];
  });
}

export const sameCards = (before: readonly VoiceCard[], now: readonly VoiceCard[]) =>
  before.length === now.length &&
  before.every((card, at) => card.id === now[at].id && card.version === now[at].version);

export const formatSeconds = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export const audioExtension = (contentType: string): AudioFormat =>
  contentType.startsWith("audio/mp4") ? "m4a" : "webm";

// A name every system saves a file under: none of the characters Windows refuses,
// no control characters, and no dots or spaces at its end.
export function safeFileName(name: string) {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 150)
    .trim();
  return cleaned || "Voice note";
}

export const voiceFileName = (board: string, title: string, format: AudioFormat) =>
  `${safeFileName(`${board} - ${title}`)}.${format}`;

export const voiceZipName = (board: string) => `${safeFileName(`${board} - voice notes`)}.zip`;

// Names for files in one folder: a name met again gets " (2)", " (3)" and so on
// before its extension. Compared without case, as Windows and macOS do.
export function uniqueNames(names: readonly string[]) {
  const taken = new Set<string>();
  return names.map((name) => {
    const dot = name.lastIndexOf(".");
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    let candidate = name;
    for (let count = 2; taken.has(candidate.toLowerCase()); count++) {
      candidate = `${stem} (${count})${extension}`;
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
