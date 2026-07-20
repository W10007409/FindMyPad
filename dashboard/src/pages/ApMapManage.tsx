import { useState } from 'react';
import { useApMapUpload } from '../api/hooks';
import { HelpPanel } from '../components/HelpPanel';

export function ApMapManage() {
  const [csv, setCsv] = useState('');
  const upload = useApMapUpload();
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-2 text-xl font-bold">AP 매핑 관리</h1>
      <HelpPanel title="AP매핑이란?" defaultOpen>
        <p>각 Wi-Fi AP(BSSID)가 어느 건물·층·구역인지 등록하면, 패드가 접속한 AP로 실내 위치를 파악할 수 있습니다.</p>
        <p>1. 아래 샘플처럼 CSV를 준비합니다. 2. 텍스트 영역에 붙여넣고 업로드합니다. 3. 업서트된 건수가 표시됩니다.</p>
        <p>BSSID는 패드 상세 화면의 &apos;주변 AP&apos; 목록에서 확인할 수 있습니다.</p>
        <pre className="overflow-x-auto rounded bg-gray-100 p-2 font-mono text-xs dark:bg-gray-900">
{`bssid,building,floor,zone,note
AA:BB:CC:DD:EE:01,본관,3,동측,회의실 앞`}
        </pre>
      </HelpPanel>
      <p className="mb-3 text-sm text-gray-500">헤더: <code>bssid,building,floor,zone,note</code></p>
      <label className="block text-sm">CSV
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={10}
          className="mt-1 w-full rounded border p-2 font-mono text-sm dark:bg-gray-800" placeholder="bssid,building,floor,zone,note" /></label>
      <button onClick={() => upload.mutate(csv)} disabled={!csv || upload.isPending}
        className="mt-3 rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">업로드</button>
      {upload.isSuccess && <p className="mt-3 text-green-700">{upload.data.upserted}건 업서트됨</p>}
      {upload.isError && <p className="mt-3 text-red-600">업로드 실패</p>}
    </div>
  );
}
