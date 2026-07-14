import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, beforeEach } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { AuthProvider } from './AuthContext';
import { LoginPage } from './LoginPage';
import { getToken } from '../api/client';

beforeEach(() => localStorage.clear());

function setup() {
  return renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>홈</div>} />
      </Routes>
    </AuthProvider>, ['/login']);
}

test('successful login stores token and navigates home', async () => {
  setup();
  await userEvent.type(screen.getByLabelText(/아이디/), 'root');
  await userEvent.type(screen.getByLabelText(/비밀번호/), 'good');
  await userEvent.click(screen.getByRole('button', { name: /로그인/ }));
  await waitFor(() => expect(screen.getByText('홈')).toBeInTheDocument());
  expect(getToken()).toBe('TOK-OK');
});
test('failed login shows error', async () => {
  setup();
  await userEvent.type(screen.getByLabelText(/아이디/), 'root');
  await userEvent.type(screen.getByLabelText(/비밀번호/), 'bad');
  await userEvent.click(screen.getByRole('button', { name: /로그인/ }));
  await waitFor(() => expect(screen.getByText(/로그인 실패/)).toBeInTheDocument());
});
