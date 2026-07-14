import { screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { StaleDevices } from './StaleDevices';
test('lists stale devices', async () => {
  renderWithProviders(<Routes><Route path="/" element={<StaleDevices />} /></Routes>);
  await waitFor(() => expect(screen.getByText('STALE1')).toBeInTheDocument());
});
