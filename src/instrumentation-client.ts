import {
  actionEnded,
  actionStarted,
  navigationStarted,
} from "@/lib/progress";

export function onRouterTransitionStart(url: string) {
  // Going to the address already shown changes nothing the bar could wait for.
  if (new URL(url, location.href).href !== location.href) navigationStarted();
}

// A server action is a request carrying this header, whichever form or button sent it,
// so counting them here covers every one without each having to report itself.
const send = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  if (!headers.has("next-action")) return send(input, init);
  actionStarted();
  try {
    return await send(input, init);
  } finally {
    actionEnded();
  }
};
