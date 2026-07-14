import { render, screen } from '@testing-library/react';
import { test, expect } from 'vitest';
import App from '../App';
test('renders heading', () => {
  render(<App />);
  expect(screen.getByText('PadTracker 관리자')).toBeInTheDocument();
});
