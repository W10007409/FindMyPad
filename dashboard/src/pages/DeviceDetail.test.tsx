import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { DeviceDetail } from './DeviceDetail';

vi.mock('react-leaflet', () => ({ MapContainer: ({ children }: any) => <div data-testid="map">{children}</div>, TileLayer: () => null, Marker: ({ children }: any) => <div>{children}</div>, Popup: ({ children }: any) => <div>{children}</div> }));

function setup() { return renderWithProviders(<Routes><Route path="/devices/:id" element={<DeviceDetail />} /></Routes>, ['/devices/1']); }

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
