import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSearchDevices, useMyDevices } from '../api/hooks';
import { useAuth, isAdmin } from '../auth/AuthContext';
import { DeviceCard } from '../components/DeviceCard';
import type { DeviceListItem } from '../api/types';

function DeviceList({ items, onNavigate }: { items: DeviceListItem[]; onNavigate: (id: number) => void }) {
  return (
    <div className="mt-4 space-y-3">
      {items.map((it) => (
        <DeviceCard key={it.serial} item={it} onClick={it.id != null ? () => onNavigate(it.id!) : undefined} />
      ))}
    </div>
  );
}

/** Admin: free search. Employee: their own pads ("내 패드"). */
export function SearchHome() {
  const { session } = useAuth();
  return isAdmin(session) ? <AdminSearch /> : <MyPads />;
}

function AdminSearch() {
  const [q, setQ] = useState('');
  const { data, isFetching, isError } = useSearchDevices(q);
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl p-4">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 사번 · 자산번호 · 시리얼 검색"
        className="w-full rounded-lg border p-3 dark:bg-gray-800" />
      {isFetching && <p className="mt-3 text-sm text-gray-500">검색 중…</p>}
      {isError && <p className="mt-3 text-sm text-red-600">검색 오류</p>}
      {data && <DeviceList items={data} onNavigate={(id) => navigate(`/devices/${id}`)} />}
      {data?.length === 0 && q && <p className="mt-4 text-sm text-gray-500">결과 없음</p>}
    </div>
  );
}

function MyPads() {
  const { data, isFetching, isError } = useMyDevices();
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="text-lg font-semibold">내 패드</h1>
      <p className="text-sm text-gray-500">나에게 지급된 패드 목록입니다.</p>
      {isFetching && <p className="mt-3 text-sm text-gray-500">불러오는 중…</p>}
      {isError && <p className="mt-3 text-sm text-red-600">불러오기 오류</p>}
      {data && <DeviceList items={data} onNavigate={(id) => navigate(`/devices/${id}`)} />}
      {data?.length === 0 && <p className="mt-4 text-sm text-gray-500">지급된 패드가 없습니다.</p>}
    </div>
  );
}
