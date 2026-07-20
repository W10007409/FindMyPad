import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { server } from '../test/setup';
import { DeviceDetail } from './DeviceDetail';

vi.mock('react-leaflet', () => ({ MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>, TileLayer: () => null, Marker: ({ children }: any) => <div>{children}</div>, Popup: ({ children }: any) => <div>{children}</div> }));

function setup(path = '/devices/1') { return renderWithProviders(<Routes><Route path="/devices/:id" element={<DeviceDetail />} /></Routes>, [path]); }

test('renders detail with user, indoor, history', async () => {
  setup();
  await waitFor(() => expect(screen.getByText('홍길동')).toBeInTheDocument());
  expect(screen.getByText(/본관/)).toBeInTheDocument();
  expect(screen.getByText(/S1/)).toBeInTheDocument();
});
test('ring button triggers request and shows sent notice', async () => {
  setup();
  await waitFor(() => screen.getByText('홍길동'));
  await userEvent.click(screen.getByRole('button', { name: /벨 울리기/ }));
  await waitFor(() => expect(screen.getByText(/전송됨/)).toBeInTheDocument());
});
test('ring button shows no_token message when device has no FCM token', async () => {
  server.use(
    http.post('*/api/admin/devices/:id/ring', () =>
      HttpResponse.json({ queued: false, reason: 'no_token' })
    )
  );
  setup();
  await waitFor(() => screen.getByText('홍길동'));
  await userEvent.click(screen.getByRole('button', { name: /벨 울리기/ }));
  await waitFor(() => expect(screen.getByText(/FCM 토큰이 없어/)).toBeInTheDocument());
  expect(screen.queryByText(/^벨울리기 전송됨$/)).not.toBeInTheDocument();
});
test('ring button shows send_failed message when delivery fails', async () => {
  server.use(
    http.post('*/api/admin/devices/:id/ring', () =>
      HttpResponse.json({ queued: false, reason: 'send_failed' })
    )
  );
  setup();
  await waitFor(() => screen.getByText('홍길동'));
  await userEvent.click(screen.getByRole('button', { name: /벨 울리기/ }));
  await waitFor(() => expect(screen.getByText(/전송 실패/)).toBeInTheDocument());
});
test('renders extended telemetry table and nearby AP list', async () => {
  server.use(
    http.get('*/api/admin/devices/:id', () => HttpResponse.json({
      device: { id: 1, serial: 'S1', assetNo: 'A-1', model: 'SM-X200', wifiMac: null, knoxLicensed: false, enrolledAt: '2026-07-01T00:00:00Z', lastSeenAt: '2026-07-13T00:00:00Z' },
      currentUser: { empNo: 'E100', name: '홍길동', dept: '개발' },
      indoor: { building: '본관', floor: '3', zone: '동측' },
      recentReports: [{
        id: 9, reportedAt: '2026-07-13T00:00:00Z', lat: null, lng: null, bssid: 'AP:1', ssid: 'CORP', batteryPct: 55,
        batteryStatus: 'Charging', batteryPlug: 'AC', batteryTempC: 29.5, batteryHealth: 'Good', batteryVoltageMv: 4123,
        wifiRssi: -55, wifiLinkMbps: 866, wifiFreqMhz: 5180, localIp: '10.0.1.23',
        storageFreeMb: 12000, storageTotalMb: 64000, osVersion: 'Android 14', uptimeSec: 7345,
        nearbyAps: [
          { bssid: 'AA:BB:CC:DD:EE:01', rssi: -40, ssid: 'CORP-5G', frequency: 5180 },
          { bssid: 'AA:BB:CC:DD:EE:02', rssi: -70, ssid: null, frequency: null },
        ],
      }],
      history: [{ id: 3, empNo: 'E100', name: '홍길동', checkedOut: '2026-07-10T00:00:00Z', returnedAt: null, consentAt: '2026-07-10T00:00:00Z' }],
    }))
  );
  setup();
  await waitFor(() => screen.getByText('홍길동'));
  expect(screen.getByText('Charging')).toBeInTheDocument();
  expect(screen.getByText('Android 14')).toBeInTheDocument();
  expect(screen.getByText(/12000/)).toBeInTheDocument();
  expect(screen.getByText(/10\.0\.1\.23/)).toBeInTheDocument();
  await userEvent.click(screen.getByText(/주변 AP/));
  expect(screen.getByText(/AA:BB:CC:DD:EE:01/)).toBeInTheDocument();
  expect(screen.getByText(/CORP-5G/)).toBeInTheDocument();
  expect(screen.getByText(/AA:BB:CC:DD:EE:02/)).toBeInTheDocument();
});
test('shows not-found instead of crashing when server returns 200 with no device', async () => {
  server.use(
    http.get('*/api/admin/devices/:id', () =>
      HttpResponse.json({ device: null, currentUser: null, indoor: null, recentReports: [], history: [] })
    )
  );
  setup('/devices/999');
  await waitFor(() => expect(screen.getByText('기기를 찾을 수 없습니다')).toBeInTheDocument());
});
