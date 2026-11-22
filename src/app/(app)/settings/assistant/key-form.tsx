"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/form-message";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AssistantModels } from "@/modules/assistant/schema";
import {
  removeAssistantKeyAction,
  saveAssistantKeyAction,
  saveAssistantModelsAction,
  saveAssistantPrivateModelAction,
  testAssistantKeyAction,
} from "./actions";

function SaveForm({ onSaved }: { onSaved?: () => void }) {
  const [state, action, pending] = useActionState(
    async (previous: Parameters<typeof saveAssistantKeyAction>[0], data: FormData) => {
      const result = await saveAssistantKeyAction(previous, data);
      if (result?.ok) onSaved?.();
      return result;
    },
    null,
  );

  return (
    <form action={action} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="apiKey">OpenRouter key</Label>
        <Input
          id="apiKey"
          name="apiKey"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-or-v1-…"
          required
        />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save key"}
      </Button>
    </form>
  );
}

export function KeyCard({
  saved,
}: {
  saved: { ending: string | null; readable: boolean } | null;
}) {
  const [replacing, setReplacing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [tested, test, testing] = useActionState(testAssistantKeyAction, null);

  if (!saved) return <SaveForm />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {saved.readable ? (
            <>
              Configured · key ending <span className="font-mono">…{saved.ending}</span>
            </>
          ) : (
            "Configured"
          )}
        </span>
        {saved.readable && (
          <form action={test}>
            <Button type="submit" variant="outline" size="sm" disabled={testing}>
              {testing ? "Testing…" : "Test key"}
            </Button>
          </form>
        )}
        <Button variant="outline" size="sm" onClick={() => setReplacing(!replacing)}>
          {replacing ? "Keep this key" : "Replace"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Remove
        </Button>
      </div>
      <FormMessage state={tested} />
      {!saved.readable && (
        <p role="alert" className="text-sm text-destructive">
          This key was saved with a different encryption key, so it can&apos;t be read here.
          Enter it again.
        </p>
      )}
      {(replacing || !saved.readable) && <SaveForm onSaved={() => setReplacing(false)} />}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your OpenRouter key?</AlertDialogTitle>
            <AlertDialogDescription>
              The assistant stops answering until you add a key again. Your chats stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={removeAssistantKeyAction} onSubmit={() => setConfirming(false)}>
              <AlertDialogAction type="submit" variant="destructive" className="w-full">
                Remove key
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const MODEL_FIELDS = [
  {
    name: "mainModel",
    label: "Main model",
    hint: "Answers you in the chat.",
  },
  {
    name: "backupModel",
    label: "Backup model",
    hint: "Used when the main model is down or busy.",
  },
  {
    name: "helperModel",
    label: "Helper model",
    hint: "Will read long material for the main model. Not used yet.",
  },
] as const;

export function ModelsForm({ models }: { models: AssistantModels }) {
  const [state, action, pending] = useActionState(saveAssistantModelsAction, null);

  return (
    <form action={action} className="grid max-w-md gap-4">
      {MODEL_FIELDS.map(({ name, label, hint }) => (
        <div key={name} className="grid gap-2">
          <Label htmlFor={name}>{label}</Label>
          <Input
            id={name}
            name={name}
            defaultValue={models[name]}
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            className="font-mono"
            required
          />
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      ))}
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save models"}
      </Button>
    </form>
  );
}

export function PrivateModelForm({ privateModel }: { privateModel: string | null }) {
  const [state, action, pending] = useActionState(saveAssistantPrivateModelAction, null);

  return (
    <form action={action} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="privateModel">Model for your calendar</Label>
        <Input
          id="privateModel"
          name="privateModel"
          defaultValue={privateModel ?? ""}
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          className="font-mono"
          placeholder="Your main model"
        />
        <p className="text-sm text-muted-foreground">
          Any model OpenRouter lists, paid ones too. Leave it empty to try your main model.
        </p>
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
