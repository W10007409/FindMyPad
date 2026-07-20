import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { DeviceMap, hasCoords } from './DeviceMap';

// react-leaflet은 jsdom에서 무겁다 → 모킹
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>,
  TileLayer: () => null, Marker: ({ children }: any) => <div>{children}</div>, Popup: ({ children }: any) => <div>{children}</div>,
}));

test('hasCoords', () => { expect(hasCoords(1, 2)).toBe(true); expect(hasCoords(null, 2)).toBe(false); expect(hasCoords(1, null)).toBe(false); });
test('renders map when coords present', () => {
  render(<DeviceMap lat={37.5} lng={127} indoor={null} />);
  expect(screen.getByTestId('map')).toBeInTheDocument();
});
test('renders no-coords fallback without duplicating indoor label (LocationSection owns indoor display)', () => {
  render(<DeviceMap lat={null} lng={null} indoor={{ building: '본관', floor: '3', zone: '동측' }} />);
  expect(screen.getByText(/네트워크 좌표 없음/)).toBeInTheDocument();
  expect(screen.queryByText('본관')).not.toBeInTheDocument();
});
