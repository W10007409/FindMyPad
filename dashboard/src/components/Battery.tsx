export function Battery({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-gray-400">—</span>;
  const color = pct <= 15 ? 'text-red-500' : pct <= 40 ? 'text-amber-500' : 'text-green-600';
  return <span className={color}>{pct}%</span>;
}
