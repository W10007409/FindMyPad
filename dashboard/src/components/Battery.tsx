export type BatteryLevel = 'danger' | 'warn' | 'ok';

export function batteryLevel(pct: number): BatteryLevel {
  if (pct <= 15) return 'danger';
  if (pct <= 40) return 'warn';
  return 'ok';
}

const LEVEL_CLASS: Record<BatteryLevel, string> = {
  danger: 'rounded border-l-4 border-l-danger bg-danger/10 px-1.5 py-0.5 text-danger',
  warn: 'rounded border-l-4 border-l-warn bg-warn/10 px-1.5 py-0.5 text-warn',
  ok: 'text-ok',
};

export function Battery({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-fg-muted">—</span>;
  const level = batteryLevel(pct);
  return (
    <span className={`inline-flex items-center text-sm font-medium motion-safe:transition-colors ${LEVEL_CLASS[level]}`}>
      {pct}%
    </span>
  );
}
