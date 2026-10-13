"use client";

import { useState } from "react";
import type { CompanyStatus } from "@/modules/statuses/queries";
import { StatusMenu } from "../status-menu";
import { EditStatusesDialog } from "./edit-statuses-dialog";

// A company's status badge, with the way into the list of statuses itself.
export function CompanyStatusMenu({
  value,
  statuses,
  action,
}: {
  value: string;
  statuses: CompanyStatus[];
  action: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <StatusMenu
        label="Status"
        value={value}
        options={statuses.map(({ key, label, color }) => ({
          value: key,
          label,
          color,
        }))}
        action={action}
        manage={{ label: "Edit statuses…", onSelect: () => setEditing(true) }}
      />
      <EditStatusesDialog
        open={editing}
        onOpenChange={setEditing}
        statuses={statuses}
      />
    </>
  );
}
