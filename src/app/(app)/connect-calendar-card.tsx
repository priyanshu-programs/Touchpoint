import { CalendarDays } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { Card, CardContent } from "@/components/ui/card";

export function ConnectCalendarCard() {
  return (
    <Card>
      <CardContent className="grid gap-3">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary/25">
          <CalendarDays className="size-4" aria-hidden />
        </span>
        <div className="grid gap-1">
          <h2 className="text-base font-medium">Connect Google Calendar</h2>
          <p className="text-sm text-muted-foreground">
            See your week&apos;s meetings here, and schedule new ones from Touchpoint.
          </p>
        </div>
        <ButtonLink href="/settings/integrations">Connect calendar</ButtonLink>
      </CardContent>
    </Card>
  );
}
