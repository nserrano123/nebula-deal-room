import Link from "next/link";

const LINKS = [
  { href: "/", key: "console", label: "Meeting → proposal" },
  { href: "/deals", key: "deals", label: "Deals" },
  { href: "/shield", key: "shield", label: "Shield" },
] as const;

/** The owner's three places: turn a meeting into a proposal, follow the deals, watch security. */
export function OwnerNav({ current }: { current: (typeof LINKS)[number]["key"] }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 text-sm">
      {LINKS.map((l) => (
        <Link key={l.key} href={l.href}
          className={`rounded-full px-3 py-1 ${l.key === current ? "bg-ink text-white" : "text-muted hover:bg-card hover:text-ink"}`}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
