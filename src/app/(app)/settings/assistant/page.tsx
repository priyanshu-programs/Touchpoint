import type { Metadata } from "next";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { canEncrypt } from "@/lib/crypto";
import { requireOwner } from "@/lib/session";
import { assistantSettings } from "@/modules/assistant/service";
import { KeyCard, ModelsForm } from "./key-form";

export const metadata: Metadata = { title: "Assistant" };

const outside = { target: "_blank", rel: "noopener noreferrer", className: "underline" };

export default async function AssistantSettingsPage() {
  const owner = await requireOwner();

  if (!canEncrypt()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assistant</CardTitle>
          <CardDescription>Set an encryption key first.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            Touchpoint seals your OpenRouter key before storing it. Add{" "}
            <span className="font-mono">APP_ENCRYPTION_KEY</span> (at least 32 random
            characters) to the app&apos;s environment and restart it.
          </p>
          <p className="text-muted-foreground">
            On Vercel: Project → Settings → Environment Variables, then redeploy.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { key, keyEnding, models } = await assistantSettings(owner.id);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Your OpenRouter key</CardTitle>
          <CardDescription>
            The assistant answers through OpenRouter&apos;s free models, with a key of your
            own. It is stored encrypted and never shown again.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {key === "none" && (
            <ol className="grid list-decimal gap-1 pl-5">
              <li>
                Make a free account at{" "}
                <a href="https://openrouter.ai" {...outside}>
                  openrouter.ai
                </a>
                . No card is needed.
              </li>
              <li>
                Under{" "}
                <a href="https://openrouter.ai/settings/keys" {...outside}>
                  Keys
                </a>
                , create a key and paste it here.
              </li>
            </ol>
          )}
          <KeyCard
            saved={key === "none" ? null : { ending: keyEnding, readable: key === "ready" }}
          />
          <p className="text-muted-foreground">
            A free account gets 50 requests a day across every free model, counted by
            OpenRouter and started again at midnight UTC.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What a free model may do with what you type</CardTitle>
          <CardDescription>Read this before you use the assistant.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            Each message you send, with the chat so far and the name you go by, goes to
            OpenRouter and on to the company that runs the model. Free models are usually
            free because that company may keep what it receives and train its models on it.
            Touchpoint can&apos;t prevent that, so the choice of model is yours.
          </p>
          <p>
            Nothing else leaves Touchpoint: the assistant can&apos;t yet read your
            companies, people, money, calendar or email.
          </p>
          <p>
            To see who runs a model and what they keep, open its page on OpenRouter:{" "}
            {[models.mainModel, models.backupModel].map((model, index) => (
              <span key={model}>
                {index > 0 && ", "}
                <a href={`https://openrouter.ai/${model}`} {...outside}>
                  {model}
                </a>
              </span>
            ))}
            . Your{" "}
            <a href="https://openrouter.ai/settings/privacy" {...outside}>
              OpenRouter privacy settings
            </a>{" "}
            decide which of them your key may use.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
          <CardDescription>
            Free models only, by the id OpenRouter lists them under. Free models come and
            go, so change one here if it stops answering.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModelsForm key={JSON.stringify(models)} models={models} />
        </CardContent>
      </Card>
    </div>
  );
}
