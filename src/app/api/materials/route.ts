import { refused, upload } from "@/lib/upload";
import { newMaterialInput } from "@/modules/materials/schema";
import { createMaterial } from "@/modules/materials/service";

// A new material made with an uploaded file as its first version.
export async function POST(request: Request) {
  const sent = await upload(request, ["name", "type", "description", "label"]);
  if (sent instanceof Response) return sent;
  const input = newMaterialInput.safeParse({ ...sent.values, url: "" });
  if (!input.success) {
    return Response.json(
      { reason: "invalid", message: input.error.issues[0].message },
      { status: 400 },
    );
  }

  const result = await createMaterial(sent.ownerId, input.data, {
    name: sent.file.name,
    bytes: Buffer.from(await sent.file.arrayBuffer()),
  });
  if (result.ok) return Response.json({ id: result.id });
  return refused(
    {
      name_taken: 409,
      limit: 409,
      too_large: 413,
      kind: 415,
      full: 507,
      rate: 429,
    }[result.reason],
    result.reason,
  );
}
