import { useNavigate } from 'react-router-dom';
import { useStaleDevices } from '../api/hooks';
import { LastSeen } from '../components/LastSeen';
import { HelpPanel } from '../components/HelpPanel';

export function StaleDevices() {
  const { data, isLoading, isError } = useStaleDevices(7);
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-3 text-xl font-bold">무응답 기기 <span className="text-sm font-normal text-gray-500">(7일+ 미보고 · 분실 의심)</span></h1>
      <HelpPanel title="무응답 기기란?">
        <p>최근 N일 이상 보고가 없는 패드입니다. 방전·분실·반납 누락 점검용이며, 오래된 순으로 정렬됩니다.</p>
        <p>임계일수는 무응답으로 판단하는 기준 일수입니다. 현재 이 목록은 임계일수 7일을 기준으로 조회됩니다.</p>
      </HelpPanel>
      {isLoading && <p className="text-sm text-gray-500">불러오는 중…</p>}
      {isError && <p className="text-sm text-red-600">조회 오류</p>}
      <ul className="space-y-2">
        {data?.map((s) => (
          <li key={s.id}><button onClick={() => navigate(`/devices/${s.id}`)} className="w-full rounded border p-3 text-left hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
            <span className="font-medium">{s.serial}</span> · {s.assetNo ?? '자산번호 없음'} · 마지막 <LastSeen iso={s.lastSeenAt} />
          </button></li>))}
        {data?.length === 0 && <p className="text-sm text-gray-500">무응답 기기 없음</p>}
      </ul>
    </div>
  );
}
