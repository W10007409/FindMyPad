import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { renderWithProviders } from '../test/utils';
import { ApMapManage } from './ApMapManage';

test('uploads csv and shows upserted count', async () => {
  renderWithProviders(<ApMapManage />);
  await userEvent.type(screen.getByLabelText(/CSV/), 'bssid,building\nAP:1,본관');
  await userEvent.click(screen.getByRole('button', { name: /업로드/ }));
  await waitFor(() => expect(screen.getByText(/2건/)).toBeInTheDocument());
});
test('shows help panel with sample CSV and guidance', () => {
  renderWithProviders(<ApMapManage />);
  expect(screen.getByText('AP매핑이란?')).toBeInTheDocument();
  expect(screen.getAllByText(/bssid,building,floor,zone,note/).length).toBeGreaterThan(0);
  expect(screen.getByText(/AA:BB:CC:DD:EE:01/)).toBeInTheDocument();
  expect(screen.getByText(/주변 AP/)).toBeInTheDocument();
});
