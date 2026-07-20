import type { DeviceListItem } from '../api/types';
import { Battery } from './Battery';
import { IndoorLabel } from './IndoorLabel';
import { LastSeen } from './LastSeen';
export function DeviceCard({ item, onClick }: { item: DeviceListItem; onClick?: () => void }) {
  const clickable = item.id != null;
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      aria-disabled={!clickable}
      className={
        clickable
          ? 'w-full rounded-lg border p-4 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800'
          : 'w-full cursor-default rounded-lg border p-4 text-left opacity-80 dark:border-gray-700'
      }
    >
      <div className="flex justify-between">
        <span className="font-semibold">
          {item.currentUser ? (
            <>
              <span className="mr-1 text-xs font-normal text-gray-400">지급자</span>
              {item.currentUser.dept ? `${item.currentUser.dept} ` : ''}
              <span>{item.currentUser.name}</span>
            </>
          ) : (
            '대여자 없음'
          )}
        </span>
        <div className="flex items-center gap-2">
          {!item.enrolled && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">
              미등록
            </span>
          )}
          <Battery pct={item.batteryPct} />
        </div>
      </div>
      <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {item.lat != null && item.lng != null ? `좌표 ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}` : <IndoorLabel indoor={item.indoor} />}
      </div>
      <div className="mt-1 text-xs text-gray-400">
        {item.model ?? '모델 미상'} · {item.serial} · {item.assetNo ?? '자산번호 없음'} · <LastSeen iso={item.lastSeenAt} />
      </div>
      {(item.org1 || item.location) && (
        <div className="mt-1 text-xs text-gray-400">
          {[item.org1, item.location].filter(Boolean).join(' · ')}
        </div>
      )}
    </button>
  );
}
