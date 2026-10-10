import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOwner } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import { listAudit } from "@/modules/audit/service";
import { getSettings } from "@/modules/settings/service";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditPage({
  searchParams,
}: PageProps<"/settings/audit">) {
  const owner = await requireOwner();
  const before = z.uuid().safeParse((await searchParams).before);
  const [settings, page] = await Promise.all([
    getSettings(owner.id),
    listAudit(owner.id, { beforeId: before.success ? before.data : undefined }),
  ]);
  const timezone = settings?.timezone ?? "UTC";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit log</CardTitle>
        <CardDescription>
          Every recorded change to your data, newest first.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {page.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No changes have been recorded yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Record</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDateTime(row.createdAt, timezone)}</TableCell>
                  <TableCell>{row.actor}</TableCell>
                  <TableCell className="font-mono">{row.action}</TableCell>
                  <TableCell>{row.entityType}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {page.nextBeforeId && (
          <Link
            href={`/settings/audit?before=${page.nextBeforeId}`}
            className="justify-self-start text-sm underline"
          >
            Older entries
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
