import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { IndoorLabel } from './IndoorLabel';
import { Battery } from './Battery';
import { DeviceCard } from './DeviceCard';
import type { DeviceListItem } from '../api/types';

test('IndoorLabel shows building/floor/zone', () => {
  render(<IndoorLabel indoor={{ building: '본관', floor: '3', zone: '동측' }} />);
  expect(screen.getByText(/본관/)).toBeInTheDocument();
  expect(screen.getByText(/3/)).toBeInTheDocument();
});
test('IndoorLabel null shows placeholder', () => {
  render(<IndoorLabel indoor={null} />);
  expect(screen.getByText(/실내위치 미확인/)).toBeInTheDocument();
});
test('Battery shows percent', () => { render(<Battery pct={77} />); expect(screen.getByText(/77%/)).toBeInTheDocument(); });
test('Battery null shows dash', () => { render(<Battery pct={null} />); expect(screen.getByText('—')).toBeInTheDocument(); });

const item: DeviceListItem = { id: 1, serial: 'S1', assetNo: 'A-1', model: 'M', batteryPct: 50, lastSeenAt: '2026-07-13T00:00:00Z', lat: null, lng: null, currentUser: { empNo: 'E1', name: '홍길동', dept: '개발' }, indoor: { building: '본관', floor: '3', zone: '동측' } };
test('DeviceCard shows current user and serial', () => {
  render(<DeviceCard item={item} onClick={() => {}} />);
  expect(screen.getByText('홍길동')).toBeInTheDocument();
  expect(screen.getByText(/S1/)).toBeInTheDocument();
});
