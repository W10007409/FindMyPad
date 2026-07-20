import type { DeviceListItem } from '../api/types';
import { Battery } from './Battery';
import { IndoorLabel } from './IndoorLabel';
import { LastSeen } from './LastSeen';
import { isStale } from './StaleBadge';
export function DeviceCard({ item, onClick }: { item: DeviceListItem; onClick?: () => void }) {
  const clickable = item.id != null;
  const stale = clickable && isStale(item.lastSeenAt);
  const stripe = clickable ? (stale ? 'border-l-4 border-l-danger' : 'border-l-4 border-l-ok') : 'border-l-4 border-l-border';
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-disabled={!clickable}
      className={
        clickable
          ? `w-full rounded-lg border border-border bg-surface p-4 text-left ${stripe} hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:transition-colors`
          : `w-full cursor-default rounded-lg border border-border bg-surface p-4 text-left opacity-80 ${stripe}`
      }
    >
      <div className="flex justify-between">
        <span className="font-semibold text-fg">
          {item.currentUser ? (
            <>
              <span className="mr-1 text-xs font-normal text-fg-muted">지급자</span>
              {item.currentUser.dept ? `${item.currentUser.dept} ` : ''}
              <span>{item.currentUser.name}</span>
            </>
          ) : (
            '대여자 없음'
          )}
        </span>
        <div className="flex items-center gap-2">
          {!item.enrolled && (
            <span className="rounded border border-warn/30 bg-warn/10 px-1.5 py-0.5 text-xs font-medium text-warn">
              미등록
            </span>
          )}
          <Battery pct={item.batteryPct} />
        </div>
      </div>
      <div className="mt-1 text-sm text-fg-muted">
        {item.lat != null && item.lng != null ? `좌표 ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}` : <IndoorLabel indoor={item.indoor} />}
      </div>
      <div className="mt-1 text-xs text-fg-muted">
        {item.model ?? '모델 미상'} · {item.serial} · {item.assetNo ?? '자산번호 없음'} · <LastSeen iso={item.lastSeenAt} />
      </div>
      {(item.org1 || item.location) && (
        <div className="mt-1 text-xs text-fg-muted">
          {[item.org1, item.location].filter(Boolean).join(' · ')}
        </div>
      )}
    </button>
  );
}
