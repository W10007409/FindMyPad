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
test('shows not-found instead of crashing when server returns 200 with no device', async () => {
  server.use(
    http.get('*/api/admin/devices/:id', () =>
      HttpResponse.json({ device: null, currentUser: null, indoor: null, recentReports: [], history: [] })
    )
  );
  setup('/devices/999');
  await waitFor(() => expect(screen.getByText('기기를 찾을 수 없습니다')).toBeInTheDocument());
});
