import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { expect, test, beforeEach } from 'vitest';
import { makeClient } from '../test/utils';
import { useSearchDevices, useStaleDevices, useRing, useLogin } from './hooks';
import type { ReactNode } from 'react';

function wrap() { const c = makeClient(); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={c}>{children}</QueryClientProvider>; }
beforeEach(() => localStorage.clear());

test('useSearchDevices returns items', async () => {
  const { result } = renderHook(() => useSearchDevices('hong'), { wrapper: wrap() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data![0].serial).toBe('S1');
});
test('useStaleDevices returns items', async () => {
  const { result } = renderHook(() => useStaleDevices(7), { wrapper: wrap() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data![0].serial).toBe('STALE1');
});
test('useLogin returns token', async () => {
  const { result } = renderHook(() => useLogin(), { wrapper: wrap() });
  result.current.mutate({ empNo: 'root', password: 'good' });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data!.token).toBe('TOK-OK');
});
test('useRing succeeds', async () => {
  const { result } = renderHook(() => useRing(), { wrapper: wrap() });
  result.current.mutate(1);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});
