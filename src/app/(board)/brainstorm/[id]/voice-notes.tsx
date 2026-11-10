"use client";

import { CaptureUpdateAction, newElementWith, ROUNDNESS } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Download, Loader2, Mic, Pause, Pencil, Play, Square } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type Ref } from "react";
import {
  formatSeconds,
  MAX_BOARD_VOICE_NOTES,
  MAX_VOICE_SECONDS,
  MAX_VOICE_TITLE,
  voiceFileName,
  voiceOf,
  voiceTitle,
  VOICE_WARN_SECONDS,
  type AudioFormat,
  type VoiceCard,
  type VoiceMark,
} from "@/modules/brainstorm/voice";
import "./voice-notes.css";

// Opus first: the smallest for a voice at the same clearness. Older Safari
// records only AAC in MP4.
const KINDS = [
  { type: "audio/webm;codecs=opus", format: "webm", bitrate: 24_000 },
  { type: "audio/mp4;codecs=mp4a.40.2", format: "m4a", bitrate: 32_000 },
  { type: "audio/mp4", format: "m4a", bitrate: 32_000 },
] as const;

export type Recording = { blob: Blob; seconds: number; format: AudioFormat };

type RecorderState =
  | { state: "idle" }
  | { state: "starting" }
  | { state: "recording"; seconds: number }
  | { state: "refused"; message: string };

const MIC_REFUSED =
  "Touchpoint can't use your microphone. Allow it for this site in your browser's settings, then try again.";

export function useRecorder(onRecorded: (recording: Recording) => void) {
  const [status, setStatus] = useState<RecorderState>({ state: "idle" });
  const recorder = useRef<MediaRecorder | null>(null);
  const done = useRef(onRecorded);
  useEffect(() => {
    done.current = onRecorded;
  });
  useEffect(() => () => recorder.current?.stop(), []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setStatus({ state: "refused", message: "This browser can't record sound." });
      return;
    }
    setStatus({ state: "starting" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setStatus({
        state: "refused",
        message:
          name === "NotFoundError"
            ? "No microphone was found. Plug one in, then try again."
            : MIC_REFUSED,
      });
      return;
    }

    const kind = KINDS.find(({ type }) => MediaRecorder.isTypeSupported(type));
    const made = new MediaRecorder(stream, {
      ...(kind && { mimeType: kind.type }),
      audioBitsPerSecond: kind?.bitrate ?? 24_000,
    });
    const chunks: Blob[] = [];
    const began = performance.now();
    const elapsed = () => Math.min(MAX_VOICE_SECONDS, (performance.now() - began) / 1000);
    // Once a second: each tick redraws the board's tools, and a large board
    // is slow to redraw.
    const tick = setInterval(() => {
      const seconds = elapsed();
      if (seconds >= MAX_VOICE_SECONDS) made.stop();
      else setStatus({ state: "recording", seconds });
    }, 1000);

    made.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
    made.onstop = () => {
      clearInterval(tick);
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      setStatus({ state: "idle" });
      const type = made.mimeType || kind?.type || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) return;
      done.current({
        blob,
        seconds: Math.max(1, Math.round(elapsed())),
        format: type.startsWith("audio/mp4") ? "m4a" : "webm",
      });
    };
    recorder.current = made;
    made.start(1000);
    setStatus({ state: "recording", seconds: 0 });
  }

  const stop = () => recorder.current?.stop();
  const dismiss = () => setStatus({ state: "idle" });
  return { status, start, stop, dismiss };
}

export function RecordButton({
  status,
  onStart,
  onStop,
  disabled,
  className,
}: {
  status: RecorderState;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  className?: string;
}) {
  if (status.state === "recording") {
    const left = MAX_VOICE_SECONDS - status.seconds;
    return (
      <button
        type="button"
        onClick={onStop}
        className={`h-9 items-center gap-1.5 self-center rounded-lg bg-red-600 px-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 ${className}`}
      >
        <Square aria-hidden className="size-3.5 fill-current" />
        <span className="tabular-nums" aria-live="polite">
          {status.seconds >= VOICE_WARN_SECONDS
            ? `Stops in ${formatSeconds(left)}`
            : formatSeconds(status.seconds)}
        </span>
        <span className="sr-only">Stop recording</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled || status.state === "starting"}
      className={`h-9 items-center gap-1.5 self-center rounded-lg bg-card px-2.5 text-sm shadow-sm ring-1 ring-foreground/10 hover:bg-accent disabled:opacity-60 ${className}`}
    >
      {status.state === "starting" ? (
        <Loader2 aria-hidden className="size-4 animate-spin" />
      ) : (
        <Mic aria-hidden className="size-4 text-red-600" />
      )}
      <span className="sr-only sm:not-sr-only">Voice note</span>
    </button>
  );
}

const CARD_WIDTH = 300;
const CARD_HEIGHT = 88;
export const VOICE_CARD_SIZE = { width: CARD_WIDTH, height: CARD_HEIGHT };

// The card that plays a recording: a plain box, so it moves, copies and undoes
// like any other, whose mark has the board draw its controls over it.
export function voiceCardElement(at: { x: number; y: number }, voice: VoiceMark) {
  return {
    type: "rectangle" as const,
    x: at.x,
    y: at.y,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: "#e7f5ff",
    strokeColor: "#74c0fc",
    strokeWidth: 1,
    fillStyle: "solid" as const,
    roughness: 0,
    roundness: { type: ROUNDNESS.ADAPTIVE_RADIUS },
    customData: { voice },
  };
}

// The next free "Voice note N" on the board.
export function nextVoiceTitle(api: ExcalidrawImperativeAPI) {
  const taken = new Set(
    api
      .getSceneElements()
      .map((element) => voiceOf(element)?.title.toLowerCase())
      .filter(Boolean),
  );
  let count = 1;
  while (taken.has(`voice note ${count}`)) count++;
  return `Voice note ${count}`;
}

export const voiceCount = (api: ExcalidrawImperativeAPI) =>
  new Set(api.getSceneElements().flatMap((element) => voiceOf(element)?.key ?? [])).size;

function retitle(api: ExcalidrawImperativeAPI, id: string, title: string) {
  api.updateScene({
    elements: api.getSceneElementsIncludingDeleted().map((element) => {
      const voice = element.id === id ? voiceOf(element) : null;
      return voice
        ? newElementWith(element, {
            customData: { ...element.customData, voice: { ...voice, title } },
          })
        : element;
    }),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

export const VOICE_REFUSALS: Record<string, string> = {
  too_large: "That recording is too big to keep. Keep voice notes under 3 minutes.",
  limit: `A board can hold ${MAX_BOARD_VOICE_NOTES} voice notes. Delete one you no longer need first.`,
  rate: "That's a lot of voice notes in one minute. Wait a moment, then try again.",
  full: "There's no room left for voice notes (50 MB in all). Delete some you no longer need first.",
  kind: "That recording couldn't be read. Try recording it again.",
  not_found: "This board no longer exists.",
};
export const VOICE_UNSENT =
  "The voice note couldn't be saved. Check your connection and try again.";

// Sends a recording under a new id. The reason it was refused, or null once stored.
export async function sendVoiceNote(boardId: string, key: string, recording: Recording) {
  const body = new FormData();
  body.set("key", key);
  body.set("file", recording.blob);
  const response = await fetch(`/api/brainstorm/${boardId}/voice-notes`, {
    method: "POST",
    body,
  }).catch(() => null);
  if (!response) return VOICE_UNSENT;
  if (response.ok) return null;
  if (response.status === 413) return VOICE_REFUSALS.too_large;
  const { reason } = await response.json().catch(() => ({ reason: null }));
  return VOICE_REFUSALS[reason] ?? VOICE_UNSENT;
}

const placed = ({ x, y, width, height, angle }: VoiceCard): CSSProperties => ({
  left: x,
  top: y,
  width,
  height,
  transform: `rotate(${angle}rad)`,
});

// The controls of each card on the screen, in a layer over the canvases moved
// and scaled with the drawing through `layer`. Only the buttons take the
// pointer; the rest of the card is the box beneath, to drag or select.
export function VoiceLayer({
  layer,
  cards,
  api,
  boardId,
  boardName,
  renaming,
  onRenaming,
}: {
  layer: Ref<HTMLDivElement>;
  cards: readonly VoiceCard[];
  api: ExcalidrawImperativeAPI | null;
  boardId: string;
  boardName: string;
  renaming: string | null;
  onRenaming: (id: string | null) => void;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<{ key: string; at: number; paused: boolean } | null>(
    null,
  );
  const [broken, setBroken] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);

  function toggle(card: VoiceCard) {
    audio.current ??= new Audio();
    const player = audio.current;
    if (playing?.key === card.key) {
      if (player.paused) void player.play();
      else player.pause();
      return;
    }
    player.pause();
    player.src = `/api/brainstorm/${boardId}/voice-notes/${card.key}`;
    player.ontimeupdate = () =>
      setPlaying((now) => now && { ...now, at: player.currentTime });
    player.onplay = () => setPlaying((now) => now && { ...now, paused: false });
    player.onpause = () => setPlaying((now) => now && { ...now, paused: true });
    player.onended = () => setPlaying(null);
    player.onerror = () => {
      setPlaying(null);
      setBroken(card.key);
    };
    setBroken(null);
    setPlaying({ key: card.key, at: 0, paused: false });
    player.play().catch(() => undefined);
  }

  return (
    <div className="voice-cards">
      <div ref={layer} className="sticky-layer">
        {cards.map((card) => {
          const now = playing?.key === card.key ? playing : null;
          return (
            <div key={card.id} className="voice-card" style={placed(card)}>
              <button
                type="button"
                onClick={() => toggle(card)}
                aria-label={`${now && !now.paused ? "Pause" : "Play"} ${card.title}`}
                className="voice-play"
              >
                {now && !now.paused ? (
                  <Pause aria-hidden className="size-6 fill-current" />
                ) : (
                  <Play aria-hidden className="ml-0.5 size-6 fill-current" />
                )}
              </button>
              <div className="voice-text">
                {renaming === card.id && api ? (
                  <HeadingInput
                    title={card.title}
                    onDone={(title) => {
                      if (title !== null && title !== card.title) retitle(api, card.id, title);
                      onRenaming(null);
                    }}
                  />
                ) : (
                  <span className="voice-title" title={card.title}>
                    {card.title}
                  </span>
                )}
                <span className="voice-time">
                  {broken === card.key
                    ? "Can't be played"
                    : now
                      ? `${formatSeconds(now.at)} / ${formatSeconds(card.seconds)}`
                      : formatSeconds(card.seconds)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRenaming(card.id)}
                aria-label={`Rename ${card.title}`}
                title="Rename"
                className="voice-tool"
              >
                <Pencil aria-hidden className="size-4" />
              </button>
              <a
                href={`/api/brainstorm/${boardId}/voice-notes/${card.key}`}
                download={voiceFileName(boardName, card.title, card.format)}
                aria-label={`Download ${card.title}`}
                title="Download"
                className="voice-tool"
              >
                <Download aria-hidden className="size-4" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The heading being typed. Enter or leaving the box keeps it, Escape keeps the
// old one; one that is empty or too long is not taken.
function HeadingInput({
  title,
  onDone,
}: {
  title: string;
  onDone: (title: string | null) => void;
}) {
  const [value, setValue] = useState(title);
  const ended = useRef(false);
  const end = (kept: string | null) => {
    if (ended.current) return;
    ended.current = true;
    onDone(kept);
  };
  const parsed = voiceTitle.safeParse(value);
  const finish = () => end(parsed.success ? parsed.data : null);
  return (
    <input
      autoFocus
      aria-label="Voice note heading"
      value={value}
      maxLength={MAX_VOICE_TITLE}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish();
        if (event.key === "Escape") end(null);
      }}
      className="voice-heading-input"
    />
  );
}
