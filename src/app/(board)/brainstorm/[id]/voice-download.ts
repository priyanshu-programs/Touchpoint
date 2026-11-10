// Saves every voice note on a board as one zip. The board asks first, so a
// board with none says so instead of opening an empty download.
export async function downloadVoiceNotes(boardId: string) {
  const response = await fetch(`/api/brainstorm/${boardId}/voice-notes`).catch(() => null);
  if (!response) return "failed" as const;
  if (response.status === 404) return "none" as const;
  if (!response.ok) return "failed" as const;

  const named = response.headers
    .get("content-disposition")
    ?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  const link = document.createElement("a");
  link.href = URL.createObjectURL(await response.blob());
  link.download = named ? decodeURIComponent(named) : "voice notes.zip";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  return "saved" as const;
}

export const DOWNLOAD_MESSAGES = {
  none: "This board has no voice notes yet.",
  failed: "The voice notes could not be downloaded. Check your connection and try again.",
} as const;
