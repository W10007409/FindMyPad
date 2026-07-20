import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Indoor } from '../api/types';
import { IndoorLabel } from './IndoorLabel';

export function hasCoords(lat: number | null, lng: number | null): boolean { return lat != null && lng != null; }

export function DeviceMap({ lat, lng, indoor }: { lat: number | null; lng: number | null; indoor: Indoor | null }) {
  if (!hasCoords(lat, lng)) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border border-border bg-surface-2 text-center">
        <p className="text-sm text-fg-muted">네트워크 좌표 없음 — 실내위치 기준</p>
      </div>
    );
  }
  return (
    <MapContainer center={[lat!, lng!]} zoom={17} className="h-64 w-full rounded-lg" scrollWheelZoom={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
      <Marker position={[lat!, lng!]}><Popup><IndoorLabel indoor={indoor} /></Popup></Marker>
    </MapContainer>
  );
}
