import { Plus } from "lucide-react";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { ClickableRow } from "@/components/clickable-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import type { EngagementListRow } from "@/modules/engagements/queries";
import { DateText, EngagementStatusBadge } from "./engagement-bits";
import { engagementHref } from "./labels";

// A company's Engagements tab: its work, each opening in the Work area.
export function CompanyEngagements({
  organizationId,
  engagements,
}: {
  organizationId: string;
  engagements: EngagementListRow[];
}) {
  return (
    <div className="grid gap-4">
      <div>
        <ButtonLink href={`/work/new?company=${organizationId}`} variant="outline">
          <Plus aria-hidden />
          New engagement
        </ButtonLink>
      </div>
      {engagements.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No engagements with this company yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Engagement</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden sm:table-cell">Target end</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {engagements.map((row) => (
              <ClickableRow key={row.id} href={engagementHref(row.id)}>
                <TableCell className="whitespace-normal">
                  <div className="grid gap-1">
                    <Link
                      href={engagementHref(row.id)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.title}
                    </Link>
                    <span className="sm:hidden">
                      <EngagementStatusBadge status={row.status} />
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <EngagementStatusBadge status={row.status} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <DateText date={row.targetEndDate} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.valueMinor === null
                    ? "—"
                    : formatMoney(row.valueMinor, row.currency)}
                </TableCell>
              </ClickableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
