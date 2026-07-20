import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
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
test('sample CSV download button triggers a file download', async () => {
  const createUrl = vi.fn((_blob: Blob) => 'blob:sample');
  const revokeUrl = vi.fn();
  vi.stubGlobal('URL', { ...URL, createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  let downloadName = '';
  clickSpy.mockImplementation(function (this: HTMLAnchorElement) { downloadName = this.download; });

  renderWithProviders(<ApMapManage />);
  await userEvent.click(screen.getByRole('button', { name: /샘플 CSV 다운로드/ }));

  expect(createUrl).toHaveBeenCalledOnce();
  expect(createUrl.mock.calls[0][0]).toBeInstanceOf(Blob);
  expect(downloadName).toBe('ap-map-sample.csv');
  expect(revokeUrl).toHaveBeenCalledWith('blob:sample');

  clickSpy.mockRestore();
  vi.unstubAllGlobals();
});
