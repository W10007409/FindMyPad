export function isStale(lastSeenAt: string | null, days = 7): boolean {
  return lastSeenAt == null || (Date.now() - new Date(lastSeenAt).getTime()) > days * 86_400_000;
}

export function StaleBadge({ lastSeenAt, days = 7 }: { lastSeenAt: string | null; days?: number }) {
  if (!isStale(lastSeenAt, days)) return null;
  return (
    <span className="rounded border-l-4 border-l-danger bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger motion-safe:transition-colors">
      무응답
    </span>
  );
}
