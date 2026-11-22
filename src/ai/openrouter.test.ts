import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { replyProblem, routeFor } from "./openrouter";

const models = { mainModel: "main:free", backupModel: "backup:free", privateModel: null };

describe("OpenRouter routing", () => {
  it("lets ordinary requests fall back to the backup, and keeps Google data from providers that store it", () => {
    expect(routeFor({ ...models, privateOnly: false })).toEqual({
      model: "main:free",
      settings: { models: ["backup:free"] },
    });
    expect(routeFor({ ...models, privateOnly: true })).toEqual({
      model: "main:free",
      settings: { provider: { data_collection: "deny" } },
    });
    expect(routeFor({ ...models, privateModel: "mistralai/mistral-small", privateOnly: true })).toEqual({
      model: "mistralai/mistral-small",
      settings: { provider: { data_collection: "deny" } },
    });
  });

  it("reads a 404 on a private request as no model that keeps nothing", () => {
    const error = new APICallError({ message: "x", url: "u", requestBodyValues: {}, statusCode: 404 });
    expect(replyProblem(error, true)).toBe("no_private_model");
    expect(replyProblem(error, false)).toBe("unavailable");
  });
});
