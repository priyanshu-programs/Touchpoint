// The record panel an invoice or payment form was opened in: a company's, a person's,
// or a person's inside a company. Its action goes back there.
export type PanelOrigin = { from: "contact" | "organization"; inside?: string };

export function PanelOriginFields({ origin }: { origin?: PanelOrigin }) {
  if (!origin) return null;
  return (
    <>
      <input type="hidden" name="from" value={origin.from} />
      {origin.inside && <input type="hidden" name="inside" value={origin.inside} />}
    </>
  );
}
