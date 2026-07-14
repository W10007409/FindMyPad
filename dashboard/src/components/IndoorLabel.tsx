import type { Indoor } from '../api/types';
export function IndoorLabel({ indoor }: { indoor: Indoor | null }) {
  if (!indoor || (!indoor.building && !indoor.floor && !indoor.zone))
    return <span className="text-gray-400">실내위치 미확인</span>;
  const parts = [indoor.building, indoor.floor && `${indoor.floor}층`, indoor.zone].filter(Boolean);
  return <span className="font-medium">{parts.join(' ')}</span>;
}
