export function LastSeen({ iso }: { iso: string | null }) {
  if (!iso) return <span className="text-gray-400">보고 없음</span>;
  const d = new Date(iso);
  return <span title={iso}>{d.toLocaleString('ko-KR')}</span>;
}
