"use client";

import { RefreshCw } from "lucide-react";
import { useActionState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import {
  enrichCompanyAction,
  searchOrganizationsAction,
} from "../../organizations/actions";
import { RecordActions } from "../record-actions";

export function CompanyActions({
  hasWebsite,
  reading,
  ...record
}: ComponentProps<typeof RecordActions> & {
  hasWebsite: boolean;
  // A read is queued or under way, so another cannot be started.
  reading: boolean;
}) {
  const [state, enrich, pending] = useActionState(
    enrichCompanyAction.bind(null, record.id),
    null,
  );

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex gap-2">
        {hasWebsite && (
          <form action={enrich}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={pending || reading}
            >
              <RefreshCw aria-hidden />
              Re-enrich
            </Button>
          </form>
        )}
        <RecordActions
          {...record}
          merge={{
            noun: "company",
            plural: "companies",
            search: searchOrganizationsAction,
          }}
        />
      </div>
      {state && (
        <p role="status" className="max-w-56 text-right text-xs text-muted-foreground">
          {state.message}
        </p>
      )}
    </div>
  );
}
