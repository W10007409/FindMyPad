import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, test, beforeEach, vi } from 'vitest';
import { makeClient } from './test/utils';
import { AppRoutes } from './App';
import { AuthProvider } from './auth/AuthContext';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: ({ children }: any) => <div>{children}</div>,
  Popup: ({ children }: any) => <div>{children}</div>,
}));

beforeEach(() => localStorage.clear());

function renderApp(entries: string[]) {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MemoryRouter initialEntries={entries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

test('unauthenticated visit to / redirects to login', () => {
  renderApp(['/']);
  expect(screen.getByRole('button', { name: /로그인/ })).toBeInTheDocument();
});

test('after login, search home is reachable', async () => {
  const user = userEvent.setup();
  renderApp(['/login']);
  await user.type(screen.getByLabelText(/아이디/), 'root');
  await user.type(screen.getByLabelText(/비밀번호/), 'good');
  await user.click(screen.getByRole('button', { name: /로그인/ }));
  await waitFor(() =>
    expect(screen.getByPlaceholderText(/이름 · 사번 · 자산번호 · 시리얼 검색/)).toBeInTheDocument(),
  );
});
