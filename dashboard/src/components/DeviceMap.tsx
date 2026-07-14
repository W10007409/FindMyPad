import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Indoor } from '../api/types';
import { IndoorLabel } from './IndoorLabel';

export function hasCoords(lat: number | null, lng: number | null): boolean { return lat != null && lng != null; }

export function DeviceMap({ lat, lng, indoor }: { lat: number | null; lng: number | null; indoor: Indoor | null }) {
  if (!hasCoords(lat, lng)) {
    return (
      <div className="flex h-64 flex-col items-center justify-center rounded-lg border bg-gray-50 text-center dark:border-gray-700 dark:bg-gray-800">
        <p className="text-sm text-gray-500">네트워크 좌표 없음 — 실내위치 기준</p>
        <p className="mt-2 text-lg"><IndoorLabel indoor={indoor} /></p>
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
