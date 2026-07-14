import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

export function makeClient() { return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); }
export function Providers({ children, entries = ['/'] }: { children: ReactNode; entries?: string[] }) {
  return <QueryClientProvider client={makeClient()}><MemoryRouter initialEntries={entries} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter></QueryClientProvider>;
}
export function renderWithProviders(ui: ReactElement, entries?: string[]) { return render(<Providers entries={entries}>{ui}</Providers>); }
