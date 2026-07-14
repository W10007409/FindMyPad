export function StaleBadge({ lastSeenAt, days = 7 }: { lastSeenAt: string | null; days?: number }) {
  const stale = lastSeenAt == null || (Date.now() - new Date(lastSeenAt).getTime()) > days * 86_400_000;
  if (!stale) return null;
  return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/40 dark:text-red-300">무응답</span>;
}
