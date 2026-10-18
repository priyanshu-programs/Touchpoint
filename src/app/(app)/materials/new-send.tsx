import { toLocalInput } from "@/lib/time";
import { listSendable } from "@/modules/materials/queries";
import { SendForm } from "./send-form";

// The form that logs a send, on a material's page or in the panel of the record it went to.
export async function NewSend({
  ownerId,
  materialId,
  contact,
  organization,
  timezone,
  inside,
  cancelHref,
}: {
  ownerId: string;
  materialId?: string;
  contact: {
    id: string;
    fullName: string;
    companies: { id: string; name: string }[];
  } | null;
  organization: { id: string; name: string } | null;
  timezone: string;
  inside?: string;
  cancelHref: string;
}) {
  const sendable = await listSendable(ownerId);
  const only = contact?.companies.length === 1 ? contact.companies[0] : null;
  const company = organization ?? only;

  return (
    <SendForm
      initial={{
        materialId: materialId ?? "",
        versionId: "",
        sentAt: toLocalInput(new Date(), timezone),
        channel: "email",
        contacts: JSON.stringify(
          contact ? [{ id: contact.id, label: contact.fullName }] : [],
        ),
        organizationId: company?.id ?? "",
        organizationName: company?.name ?? "",
        note: "",
      }}
      sendable={sendable}
      timezone={timezone}
      from={contact ? "contact" : organization ? "organization" : undefined}
      inside={inside}
      back={materialId ? "material" : undefined}
      cancelHref={cancelHref}
    />
  );
}
