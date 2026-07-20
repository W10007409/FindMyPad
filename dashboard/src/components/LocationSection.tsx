import type { Indoor, NetworkLoc } from '../api/types';
import { IndoorLabel } from './IndoorLabel';

function NetworkBadge({ network }: { network: NetworkLoc | null }) {
  const onCorp = network?.onCorpNetwork ?? false;
  const label = onCorp ? '사내망' : '외부망';
  const style = onCorp
    ? 'bg-ok/10 text-ok'
    : 'border-l-4 border-l-warn bg-warn/10 text-warn';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}

export function LocationSection({ indoor, network }: { indoor: Indoor | null; network: NetworkLoc | null }) {
  const hasIndoor = !!indoor && (indoor.building || indoor.floor || indoor.zone);
  const city = network?.city ? [network.city, network.region].filter(Boolean).join(' ') : null;
  return (
    <section className="space-y-2 rounded-lg border border-border bg-surface p-3">
      <h2 className="font-semibold text-fg">위치</h2>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-fg-muted">실내:</span>
        {hasIndoor
          ? <IndoorLabel indoor={indoor} />
          : <span className="text-fg-muted">실내 위치 미확인 — AP매핑 필요</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-fg-muted">네트워크:</span>
        <NetworkBadge network={network} />
        <span className="text-fg">{network?.publicIp ?? 'IP 미확인'}</span>
        {city && <span className="text-fg-muted">{city}</span>}
      </div>
      <p className="text-xs text-fg-muted">
        이 패드는 GPS가 없어 Wi-Fi/IP 기반으로 위치를 추정합니다.
      </p>
    </section>
  );
}
