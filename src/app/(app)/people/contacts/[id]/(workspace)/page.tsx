import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactDetails } from "../../contact-details";
import { ContactEmailsAndLinks } from "../../contact-emails-links";
import { loadContact } from "../load";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({
  params,
}: PageProps<"/people/contacts/[id]">) {
  const { contact } = await loadContact((await params).id);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ContactDetails contact={contact} />
        </CardContent>
      </Card>
      <ContactEmailsAndLinks contact={contact} />
    </div>
  );
}
