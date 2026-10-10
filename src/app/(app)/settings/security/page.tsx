import type { Metadata } from "next";
import { headers } from "next/headers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { auth } from "@/lib/auth";
import { requireOwner } from "@/lib/session";
import { formatDateTime } from "@/lib/time";
import { getSettings } from "@/modules/settings/service";
import { revokeSessionAction } from "../actions";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const owner = await requireOwner();
  const [settings, sessions] = await Promise.all([
    getSettings(owner.id),
    auth.api.listSessions({ headers: await headers() }),
  ]);
  const timezone = settings?.timezone ?? "UTC";

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>
            Changing it signs out every other device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signed-in devices</CardTitle>
          <CardDescription>
            Revoke any session you do not recognise.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>IP address</TableHead>
                <TableHead>Signed in</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="max-w-64 truncate">
                    {session.userAgent ?? "Unknown device"}
                  </TableCell>
                  <TableCell>{session.ipAddress || "Unknown"}</TableCell>
                  <TableCell>
                    {formatDateTime(session.createdAt, timezone)}
                  </TableCell>
                  <TableCell className="text-right">
                    {session.token === owner.sessionToken ? (
                      <Badge variant="secondary">This device</Badge>
                    ) : (
                      <form action={revokeSessionAction}>
                        <input
                          type="hidden"
                          name="sessionId"
                          value={session.id}
                        />
                        <Button type="submit" variant="outline" size="sm">
                          Revoke
                        </Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
