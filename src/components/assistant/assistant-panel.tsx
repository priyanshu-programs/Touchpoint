"use client";

import { History, SquarePen } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChatView, useChat } from "./chat";

// The assistant beside whatever page is open. Its chat lives here, not in the sheet,
// which is taken off the page when closed.
export function AssistantPanel({
  open,
  onOpenChange,
  ready,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ready: boolean;
}) {
  const chat = useChat();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Assistant</SheetTitle>
          <SheetDescription>
            {ready ? "Talk something through." : "Not set up yet."}
          </SheetDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            {ready && (
              <Button
                variant="outline"
                size="sm"
                onClick={chat.startOver}
                disabled={chat.sending || chat.messages.length === 0}
              >
                <SquarePen aria-hidden />
                New chat
              </Button>
            )}
            <ButtonLink
              href="/assistant"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              <History aria-hidden />
              History
            </ButtonLink>
          </div>
        </SheetHeader>
        {ready ? (
          <ChatView chat={chat} />
        ) : (
          <div className="grid content-start gap-3 p-4">
            <p>
              The assistant answers through OpenRouter&apos;s free models, with a key of your
              own. It takes a couple of minutes and no card.
            </p>
            <ButtonLink
              href="/settings/assistant"
              className="justify-self-start"
              onClick={() => onOpenChange(false)}
            >
              Set up the assistant
            </ButtonLink>
            <p className="text-muted-foreground">
              Everything else in Touchpoint works the same without it.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
