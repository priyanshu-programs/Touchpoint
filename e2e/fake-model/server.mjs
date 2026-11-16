// A stand-in for OpenRouter's key and chat endpoints, for Playwright only. It listens on
// loopback and holds its count in memory. e2e/fake-google/reroute.mjs sends the app here.
import { createServer } from "node:http";

const PORT = 3103;
export const GOOD_KEY = "sk-or-v1-e2e-good-key-0123456789";
const LIMIT = 50;
let used = 0;

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const authorized = (request) => request.headers.authorization === `Bearer ${GOOD_KEY}`;

function chunk(response, body) {
  response.write(`data: ${JSON.stringify({ id: "fake-1", model: body.model, ...body.extra })}\n\n`);
}

const offers = (body, name) =>
  Array.isArray(body.tools) && body.tools.some((tool) => tool.function?.name === name);

// Asked about tasks with the task tool on offer, it calls the tool first, as a model
// would, then answers with the titles the tool gave back.
function callTasks(body, response) {
  response.writeHead(200, { "content-type": "text/event-stream" });
  chunk(response, {
    model: body.model,
    extra: {
      choices: [
        {
          index: 0,
          delta: {
            role: "assistant",
            tool_calls: [
              {
                index: 0,
                id: "call_fake_1",
                type: "function",
                function: { name: "tasksDue", arguments: JSON.stringify({ scope: "today" }) },
              },
            ],
          },
        },
      ],
    },
  });
  chunk(response, {
    model: body.model,
    extra: {
      choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 },
    },
  });
  response.end("data: [DONE]\n\n");
}

function toolTitles(messages) {
  const result = messages.filter((message) => message.role === "tool").at(-1);
  try {
    const data = JSON.parse(result.content);
    return (data.tasks ?? []).map((task) => task.title).join(", ") || "nothing";
  } catch {
    return "nothing";
  }
}

// The answer repeats the owner's last words, so a test can tell which message it answers.
// A message holding "busy" is answered as when the free models are busy.
function complete(body, response) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const last = messages.filter((message) => message.role === "user").at(-1);
  const said = typeof last?.content === "string" ? last.content : "";
  if (said.includes("busy")) {
    return send(response, 429, { error: { code: 429, message: "Upstream fake detail" } });
  }
  used += 1;
  const answered = messages.at(-1)?.role === "tool";
  if (!answered && /task|overdue/i.test(said) && offers(body, "tasksDue")) {
    return callTasks(body, response);
  }
  response.writeHead(200, { "content-type": "text/event-stream" });
  for (const text of answered ? ["Your tasks: ", toolTitles(messages)] : ["Noted: ", said]) {
    chunk(response, {
      model: body.model,
      extra: { choices: [{ index: 0, delta: { role: "assistant", content: text } }] },
    });
  }
  chunk(response, {
    model: body.model,
    extra: {
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    },
  });
  response.end("data: [DONE]\n\n");
}

createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/__fake/health") return send(response, 200, { ok: true });
  if (url.pathname === "/__fake/reset") {
    used = 0;
    return send(response, 200, { ok: true });
  }
  if (!authorized(request)) return send(response, 401, { error: { code: 401 } });

  if (request.method === "GET" && url.pathname === "/api/v1/key") {
    return send(response, 200, {
      data: {
        label: "fake",
        free_model_daily_requests: { used, limit: LIMIT, remaining: LIMIT - used },
      },
    });
  }
  if (request.method === "POST" && url.pathname === "/api/v1/chat/completions") {
    let raw = "";
    request.on("data", (part) => (raw += part));
    request.on("end", () => complete(JSON.parse(raw), response));
    return;
  }
  send(response, 404, { error: { code: 404 } });
}).listen(PORT, "127.0.0.1");
