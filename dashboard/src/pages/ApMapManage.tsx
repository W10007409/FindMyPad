import { useState } from 'react';
import { useApMapUpload } from '../api/hooks';

export function ApMapManage() {
  const [csv, setCsv] = useState('');
  const upload = useApMapUpload();
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-2 text-xl font-bold">AP 매핑 관리</h1>
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
