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
