import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { server } from '../test/setup';
import { AuthProvider } from '../auth/AuthContext';
import { setSession, setToken } from '../api/client';
import { SearchHome } from './SearchHome';

// SearchHome branches on role: these cases exercise the admin search UI.
beforeEach(() => {
  localStorage.clear();
  setToken('T');
  setSession({ role: 'admin', name: '관리자', empNo: 'root', mustChangePassword: false });
});

test('search shows result card', async () => {
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/" element={<SearchHome />} />
        <Route path="/devices/:id" element={<div>상세</div>} />
      </Routes>
    </AuthProvider>);
  await userEvent.type(screen.getByPlaceholderText(/이름.*사번/), 'hong');
  await waitFor(() => expect(screen.getByText('홍길동')).toBeInTheDocument());
  expect(screen.getByText(/본관/)).toBeInTheDocument();
});

test('unenrolled asset (id null) shows 미등록 chip and does not navigate on click', async () => {
  server.use(
    http.get('*/api/admin/devices', () =>
      HttpResponse.json({
        items: [{
          id: null, serial: 'R9TT306T78D', assetNo: '032022000216', model: 'SM-T500',
          currentUser: { empNo: '10015727', name: '이은영', dept: '서비스기획팀' },
          org1: 'AX연구소', location: '3층', enrolled: false,
          batteryPct: null, lastSeenAt: null, lat: null, lng: null, indoor: null,
        }],
      })
    )
  );
  renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/" element={<SearchHome />} />
        <Route path="/devices/:id" element={<div>상세</div>} />
      </Routes>
    </AuthProvider>);
  await userEvent.type(screen.getByPlaceholderText(/이름.*사번/), '이은영');
  await waitFor(() => expect(screen.getByText('이은영')).toBeInTheDocument());
  expect(screen.getByText(/032022000216/)).toBeInTheDocument();
  expect(screen.getByText('미등록')).toBeInTheDocument();

  await userEvent.click(screen.getByText('이은영'));
  expect(screen.queryByText('상세')).not.toBeInTheDocument();
});
