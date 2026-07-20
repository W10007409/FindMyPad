import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDeviceDetail, useLocate, useRing } from '../api/hooks';
import type { RingResult } from '../api/types';
import { DeviceMap } from '../components/DeviceMap';
import { Battery } from '../components/Battery';
import { LastSeen } from '../components/LastSeen';
import { Toast } from '../components/Toast';
import { TelemetryTable } from '../components/TelemetryTable';
import { NearbyAps } from '../components/NearbyAps';
import { LocationSection } from '../components/LocationSection';

export function ringMessage(action: 'ring' | 'locate', r: RingResult): string {
  if (r.queued) return action === 'ring' ? '벨울리기 전송됨' : '위치 요청 전송됨';
  if (r.reason === 'no_token') return '이 기기는 FCM 토큰이 없어 전송할 수 없습니다';
  if (r.reason === 'send_failed') return '전송 실패 — 잠시 후 다시 시도하세요';
  return '전송 실패';
}

export function DeviceDetail() {
  const { id } = useParams();
  const deviceId = Number(id);
  const { data, isLoading, isError } = useDeviceDetail(deviceId);
  const ring = useRing();
  const locate = useLocate();
  const [toast, setToast] = useState<string | null>(null);
  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(null), 2500); }
  if (isLoading) return <p className="p-4 text-fg-muted">불러오는 중…</p>;
  if (Number.isNaN(deviceId)) return <p className="p-4 text-danger">기기를 찾을 수 없습니다</p>;
  if (isError || !data?.device) return <p className="p-4 text-danger">기기를 찾을 수 없습니다</p>;
  const latest = data.recentReports[0];
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-fg">{data.device.serial} <span className="text-sm text-fg-muted">{data.device.assetNo}</span></h1>
          <p className="text-sm text-fg-muted">
            {data.currentUser
              ? <>{data.currentUser.dept ?? ''} <span>{data.currentUser.name}</span> ({data.currentUser.empNo})</>
              : '대여자 없음'}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => ring.mutate(deviceId, { onSuccess: (data) => notify(ringMessage('ring', data)) })} className="rounded bg-accent px-3 py-2 text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:transition">벨 울리기</button>
          <button onClick={() => locate.mutate(deviceId, { onSuccess: (data) => notify(ringMessage('locate', data)) })} className="rounded border border-border px-3 py-2 text-fg hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:transition">지금 위치 요청</button>
        </div>
      </div>
      <LocationSection indoor={data.indoor} network={data.network ?? null} />
      <DeviceMap lat={latest?.lat ?? null} lng={latest?.lng ?? null} indoor={data.indoor} />
      <section>
        <h2 className="mb-2 font-semibold text-fg">최근 보고</h2>
        <ul className="space-y-1 text-sm">
          {data.recentReports.map((r) => (
            <li key={r.id} className="flex justify-between rounded border border-border p-2">
              <LastSeen iso={r.reportedAt} /><span className="text-fg-muted">{r.ssid ?? '—'}</span><Battery pct={r.batteryPct} />
            </li>))}
        </ul>
      </section>
      <TelemetryTable report={data.recentReports[0]} />
      <NearbyAps aps={data.recentReports[0]?.nearbyAps ?? []} />
      <section>
        <h2 className="mb-2 font-semibold text-fg">대여 이력</h2>
        <ul className="space-y-1 text-sm">
          {data.history.map((h) => (
            <li key={h.id} className="rounded border border-border p-2 text-fg">{h.name} ({h.empNo}) · <LastSeen iso={h.checkedOut} /> → {h.returnedAt ? <LastSeen iso={h.returnedAt} /> : '대여 중'}</li>))}
        </ul>
      </section>
      {toast && <Toast message={toast} />}
    </div>
  );
}
