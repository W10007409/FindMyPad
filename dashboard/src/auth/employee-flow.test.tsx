import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { expect, test, beforeEach, vi } from 'vitest';
import { makeClient } from '../test/utils';
import { server } from '../test/setup';
import { AppRoutes } from '../App';
import { AuthProvider } from './AuthContext';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: () => null, Marker: ({ children }: any) => <div>{children}</div>, Popup: ({ children }: any) => <div>{children}</div>,
}));

beforeEach(() => localStorage.clear());

function renderApp(entries: string[]) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={entries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider><AppRoutes /></AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>);
}

test('mustChangePassword 로그인 → 비밀번호 변경 화면으로 강제 이동', async () => {
  server.use(http.post('*/api/admin/login', () =>
    HttpResponse.json({ token: 'T', role: 'employee', name: '이은영', empNo: '10015727', mustChangePassword: true })));
  const user = userEvent.setup();
  renderApp(['/login']);
  await user.type(screen.getByLabelText(/사번/), '10015727');
  await user.type(screen.getByLabelText(/비밀번호/), '1234');
  await user.click(screen.getByRole('button', { name: /로그인/ }));
  await waitFor(() => expect(screen.getByRole('heading', { name: '비밀번호 변경' })).toBeInTheDocument());
});

test('employee 홈은 "내 패드", 무응답/AP매핑 링크 없음', async () => {
  server.use(
    http.post('*/api/admin/login', () =>
      HttpResponse.json({ token: 'T', role: 'employee', name: '이은영', empNo: '10015727', mustChangePassword: false })),
    http.get('*/api/admin/devices', () => HttpResponse.json({ items: [] })),
  );
  const user = userEvent.setup();
  renderApp(['/login']);
  await user.type(screen.getByLabelText(/사번/), '10015727');
  await user.type(screen.getByLabelText(/비밀번호/), 'pw');
  await user.click(screen.getByRole('button', { name: /로그인/ }));
  await waitFor(() => expect(screen.getByRole('heading', { name: '내 패드' })).toBeInTheDocument());
  expect(screen.queryByText('무응답')).not.toBeInTheDocument();
  expect(screen.queryByText('AP매핑')).not.toBeInTheDocument();
});

test('employee가 /stale 직접 접근 → 홈으로 리다이렉트(관리자 전용)', async () => {
  server.use(http.get('*/api/admin/devices', () => HttpResponse.json({ items: [] })));
  // seed employee session directly
  localStorage.setItem('pad_token', 'T');
  localStorage.setItem('pad_session', JSON.stringify({ role: 'employee', name: '이은영', empNo: '10015727', mustChangePassword: false }));
  renderApp(['/stale']);
  await waitFor(() => expect(screen.getByRole('heading', { name: '내 패드' })).toBeInTheDocument());
});
