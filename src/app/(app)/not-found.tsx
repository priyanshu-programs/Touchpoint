import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid justify-items-start gap-3">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        This record does not exist, or the link is out of date.
      </p>
      <Link href="/" className="text-sm underline">
        Back to Today
      </Link>
    </div>
  );
}
