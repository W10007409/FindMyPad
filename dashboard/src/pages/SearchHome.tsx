import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchDevices } from '../api/hooks';
import { DeviceCard } from '../components/DeviceCard';

export function SearchHome() {
  const [q, setQ] = useState('');
  const { data, isFetching, isError } = useSearchDevices(q);
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl p-4">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 사번 · 자산번호 · 시리얼 검색"
        className="w-full rounded-lg border p-3 dark:bg-gray-800" />
      {isFetching && <p className="mt-3 text-sm text-gray-500">검색 중…</p>}
      {isError && <p className="mt-3 text-sm text-red-600">검색 오류</p>}
      <div className="mt-4 space-y-3">
        {data?.map((it) => <DeviceCard key={it.id} item={it} onClick={() => navigate(`/devices/${it.id}`)} />)}
        {data?.length === 0 && q && <p className="text-sm text-gray-500">결과 없음</p>}
      </div>
    </div>
  );
}
