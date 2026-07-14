import type { DeviceListItem } from '../api/types';
import { Battery } from './Battery';
import { IndoorLabel } from './IndoorLabel';
import { LastSeen } from './LastSeen';
export function DeviceCard({ item, onClick }: { item: DeviceListItem; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full rounded-lg border p-4 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
      <div className="flex justify-between">
        <span className="font-semibold">
          {item.currentUser ? (
            <>
              {item.currentUser.dept ? `${item.currentUser.dept} ` : ''}
              <span>{item.currentUser.name}</span>
            </>
          ) : (
            '대여자 없음'
          )}
        </span>
        <Battery pct={item.batteryPct} />
      </div>
      <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">
        {item.lat != null && item.lng != null ? `좌표 ${item.lat.toFixed(4)}, ${item.lng.toFixed(4)}` : <IndoorLabel indoor={item.indoor} />}
      </div>
      <div className="mt-1 text-xs text-gray-400">{item.serial} · {item.assetNo ?? '자산번호 없음'} · <LastSeen iso={item.lastSeenAt} /></div>
    </button>
  );
}
