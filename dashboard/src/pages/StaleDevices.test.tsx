import { screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { StaleDevices } from './StaleDevices';
test('lists stale devices', async () => {
  renderWithProviders(<Routes><Route path="/" element={<StaleDevices />} /></Routes>);
  await waitFor(() => expect(screen.getByText('STALE1')).toBeInTheDocument());
});
test('shows help panel explaining stale devices', () => {
  renderWithProviders(<Routes><Route path="/" element={<StaleDevices />} /></Routes>);
  expect(screen.getByText('무응답 기기란?')).toBeInTheDocument();
  expect(screen.getByText(/방전·분실·반납 누락 점검용/)).toBeInTheDocument();
  expect(screen.getByText(/임계일수/)).toBeInTheDocument();
});
