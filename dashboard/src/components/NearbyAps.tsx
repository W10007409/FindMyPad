import type { NearbyAp } from '../api/types';

export function NearbyAps({ aps }: { aps: NearbyAp[] }) {
  return (
    <section>
      <details className="rounded border p-2 text-sm dark:border-gray-700">
        <summary className="cursor-pointer font-semibold">주변 AP ({aps.length})</summary>
        {aps.length === 0 ? (
          <p className="mt-2 text-gray-400">주변 AP 정보 없음</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {aps.map((ap) => (
              <li key={ap.bssid} className="flex flex-wrap justify-between gap-2 border-t pt-1 first:border-t-0 first:pt-0 dark:border-gray-700">
                <span>{ap.bssid}</span>
                <span className="text-gray-500">{ap.rssi}dBm</span>
                <span className="text-gray-500">{ap.ssid ?? '—'}</span>
                {ap.indoor && (
                  <span className="text-gray-500">
                    {ap.indoor.building ?? '—'} {ap.indoor.floor ?? ''}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
