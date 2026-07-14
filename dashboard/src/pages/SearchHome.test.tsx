import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '../test/utils';
import { SearchHome } from './SearchHome';

test('search shows result card', async () => {
  renderWithProviders(
    <Routes>
      <Route path="/" element={<SearchHome />} />
      <Route path="/devices/:id" element={<div>상세</div>} />
    </Routes>);
  await userEvent.type(screen.getByPlaceholderText(/이름.*사번/), 'hong');
  await waitFor(() => expect(screen.getByText('홍길동')).toBeInTheDocument());
  expect(screen.getByText(/본관/)).toBeInTheDocument();
});
