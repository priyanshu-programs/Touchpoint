"use client";

import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  addMemoryAction,
  addRecordMemoryAction,
  deleteMemoryAction,
  editMemoryAction,
} from "./actions";

// From the table's limits, passed in by the page so the schema stays on the server.
export type MemoryLimits = { content: number; terms: number };

export function AddMemoryForm({
  full,
  limits,
  record,
}: {
  full: boolean;
  limits: MemoryLimits;
  // Set in a person's or company's Memory tab: the memory is about that record.
  record?: { about: "person" | "company"; id: string };
}) {
  const [about, setAbout] = useState("you");
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(
    async (previous: Parameters<typeof addMemoryAction>[0], data: FormData) => {
      const result = await (record ? addRecordMemoryAction : addMemoryAction)(previous, data);
      if (result?.ok) {
        setAbout("you");
        setFormKey((key) => key + 1);
      }
      return result;
    },
    null,
  );

  if (full) {
    return (
      <p className="text-sm text-muted-foreground">
        That is the most kept. Delete some to make room.
      </p>
    );
  }

  return (
    <form key={formKey} action={action} className="grid max-w-xl gap-4">
      {record ? (
        <>
          <input type="hidden" name="about" value={record.about} />
          <input type="hidden" name="recordId" value={record.id} />
        </>
      ) : (
      <div className="flex flex-wrap gap-4">
        <div className="grid gap-2">
          <Label htmlFor="memory-about">About</Label>
          <NativeSelect
            id="memory-about"
            name="about"
            value={about}
            onChange={(event) => setAbout(event.target.value)}
          >
            <NativeSelectOption value="you">You</NativeSelectOption>
            <NativeSelectOption value="person">A person</NativeSelectOption>
            <NativeSelectOption value="company">A company</NativeSelectOption>
          </NativeSelect>
        </div>
        {about !== "you" && (
          <div className="grid min-w-0 flex-1 gap-2">
            <Label htmlFor="memory-name">{about === "person" ? "Person's name" : "Company's name"}</Label>
            <Input id="memory-name" name="name" maxLength={200} required autoComplete="off" />
          </div>
        )}
      </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="memory-content">Remember</Label>
        <Textarea
          id="memory-content"
          name="content"
          maxLength={limits.content}
          required
          rows={2}
          placeholder="Prefers WhatsApp to email"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="memory-terms">Other words for it (optional)</Label>
        <Input id="memory-terms" name="terms" maxLength={limits.terms} autoComplete="off" />
      </div>
      <FormMessage state={state} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Add memory"}
      </Button>
    </form>
  );
}

export type MemoryRowData = {
  id: string;
  content: string;
  terms: string | null;
  recordName: string | null;
  recordHref: string | null;
  fromAssistant: boolean;
};

export function MemoryRow({ memory, limits }: { memory: MemoryRowData; limits: MemoryLimits }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(
    async (previous: Parameters<typeof editMemoryAction>[0], data: FormData) => {
      const result = await editMemoryAction(previous, data);
      if (result?.ok) setEditing(false);
      return result;
    },
    null,
  );

  return (
    <div className="grid gap-2 rounded-md border bg-card p-3 text-sm">
      {memory.recordName && (
        <p className="font-medium">
          {memory.recordHref ? (
            <Link href={memory.recordHref} className="underline">
              {memory.recordName}
            </Link>
          ) : (
            memory.recordName
          )}
        </p>
      )}
      {editing ? (
        <form action={action} className="grid gap-2">
          <input type="hidden" name="id" value={memory.id} />
          <Label htmlFor={`content-${memory.id}`} className="sr-only">
            Memory
          </Label>
          <Textarea
            id={`content-${memory.id}`}
            name="content"
            defaultValue={memory.content}
            maxLength={limits.content}
            required
            rows={2}
          />
          <Label htmlFor={`terms-${memory.id}`}>Other words for it</Label>
          <Input
            id={`terms-${memory.id}`}
            name="terms"
            defaultValue={memory.terms ?? ""}
            maxLength={limits.terms}
            autoComplete="off"
          />
          <FormMessage state={state} />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-2">
          <div className="grid min-w-0 flex-1 gap-1">
            <p className="break-words">{memory.content}</p>
            <p className="text-xs text-muted-foreground">
              {memory.fromAssistant ? "Saved by the assistant" : "Added by you"}
              {memory.terms && ` · also: ${memory.terms}`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit memory: ${memory.content}`}
            title="Edit"
            onClick={() => setEditing(true)}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete memory: ${memory.content}`}
            title="Delete"
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      )}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this memory?</AlertDialogTitle>
            <AlertDialogDescription>
              “{memory.content}” is forgotten, and the assistant won&apos;t use it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={deleteMemoryAction} onSubmit={() => setConfirming(false)}>
              <input type="hidden" name="id" value={memory.id} />
              <AlertDialogAction type="submit" variant="destructive" className="w-full">
                Delete memory
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
