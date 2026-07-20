import type { Report } from '../api/types';

function fmt(value: string | number | null | undefined, suffix = ''): string {
  if (value == null) return '—';
  return `${value}${suffix}`;
}

function fmtUptime(sec: number | null): string {
  if (sec == null) return '—';
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  return `${hours}시간 ${minutes}분`;
}

function fmtStorage(freeMb: number | null, totalMb: number | null): string {
  if (freeMb == null && totalMb == null) return '—';
  return `${freeMb ?? '—'} / ${totalMb ?? '—'} MB`;
}

export function TelemetryTable({ report }: { report: Report | undefined | null }) {
  if (!report) return null;
  const rows: [string, string][] = [
    ['배터리 상태', fmt(report.batteryStatus)],
    ['배터리 플러그', fmt(report.batteryPlug)],
    ['배터리 온도', fmt(report.batteryTempC, '℃')],
    ['배터리 전압', fmt(report.batteryVoltageMv, 'mV')],
    ['Wi-Fi RSSI', fmt(report.wifiRssi, 'dBm')],
    ['Wi-Fi 링크', fmt(report.wifiLinkMbps, 'Mbps')],
    ['Wi-Fi 주파수', fmt(report.wifiFreqMhz, 'MHz')],
    ['내부 IP', fmt(report.localIp)],
    ['저장공간', fmtStorage(report.storageFreeMb, report.storageTotalMb)],
    ['OS', fmt(report.osVersion)],
    ['가동시간', fmtUptime(report.uptimeSec)],
  ];
  return (
    <section>
      <h2 className="mb-2 font-semibold">텔레메트리</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded border p-2 text-sm dark:border-gray-700 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 sm:block">
            <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
