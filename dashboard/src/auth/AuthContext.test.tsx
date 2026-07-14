import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { beforeEach, expect, test } from 'vitest';
import { AuthProvider, RequireAuth, useAuth } from './AuthContext';
import { getToken } from '../api/client';

function LoginProbe() { const { login } = useAuth(); return <button onClick={() => login('TOK')}>login</button>; }

beforeEach(() => localStorage.clear());

test('RequireAuth redirects to /login when no token', () => {
  render(
    <MemoryRouter initialEntries={['/secret']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route element={<RequireAuth />}><Route path="/secret" element={<div>secret</div>} /></Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>);
  expect(screen.getByText('login page')).toBeInTheDocument();
});

test('login stores token via client.setToken', () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AuthProvider><LoginProbe /></AuthProvider></MemoryRouter>);
  act(() => { screen.getByText('login').click(); });
  expect(getToken()).toBe('TOK');
});
