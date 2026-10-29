"use client";

import { Check, Copy } from "lucide-react";
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
import { removeGoogleClientAction, saveGoogleClientAction } from "./actions";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Copied" : label}
    </Button>
  );
}

function SaveForm({ onSaved }: { onSaved?: () => void }) {
  const [state, action, pending] = useActionState(
    async (previous: Parameters<typeof saveGoogleClientAction>[0], data: FormData) => {
      const result = await saveGoogleClientAction(previous, data);
      if (result?.ok) onSaved?.();
      return result;
    },
    null,
  );

  return (
    <form action={action} className="grid max-w-md gap-4">
      <div className="grid gap-2">
        <Label htmlFor="clientId">Client ID</Label>
        <Input
          id="clientId"
          name="clientId"
          autoComplete="off"
          spellCheck={false}
          placeholder="1234567890-abc.apps.googleusercontent.com"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="clientSecret">Client secret</Label>
        <Input
          id="clientSecret"
          name="clientSecret"
          type="password"
          autoComplete="off"
          required
        />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Save client"}
      </Button>
    </form>
  );
}

export function ClientCard({
  saved,
}: {
  saved: { idEnding: string; readable: boolean } | null;
}) {
  const [replacing, setReplacing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!saved) return <SaveForm />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          Configured · client ID ending <span className="font-mono">…{saved.idEnding}</span>
        </span>
        <Button variant="outline" size="sm" onClick={() => setReplacing(!replacing)}>
          {replacing ? "Keep this client" : "Replace"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Remove
        </Button>
      </div>
      {!saved.readable && (
        <p role="alert" className="text-sm text-destructive">
          This client was saved with a different encryption key, so it can&apos;t be read
          here. Enter it again.
        </p>
      )}
      {(replacing || !saved.readable) && <SaveForm onSaved={() => setReplacing(false)} />}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your Google client?</AlertDialogTitle>
            <AlertDialogDescription>
              Touchpoint disconnects your Google account and forgets the client ID and
              secret. You can enter them again at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={removeGoogleClientAction} onSubmit={() => setConfirming(false)}>
              <AlertDialogAction type="submit" variant="destructive" className="w-full">
                Remove client
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
