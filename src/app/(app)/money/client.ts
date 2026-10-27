import { getContact } from "@/modules/contacts/queries";
import { getOrganization } from "@/modules/organizations/queries";

// A list or the overview can be narrowed to one client from their Invoices tab or a
// figure that counts them; the name is shown only once the record is found to be the
// owner's.
export async function namedClient(
  ownerId: string,
  { company, person }: { company?: string; person?: string },
) {
  if (company) {
    const organization = await getOrganization(ownerId, company);
    return organization ? { name: organization.name, organizationId: company } : null;
  }
  if (person) {
    const contact = await getContact(ownerId, person);
    return contact ? { name: contact.fullName, contactId: person } : null;
  }
  return null;
}
