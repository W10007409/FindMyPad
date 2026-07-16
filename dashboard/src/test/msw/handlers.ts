import { http, HttpResponse } from 'msw';
export const handlers = [
  http.post('*/api/admin/login', async ({ request }) => {
    const b = (await request.json()) as { username: string; password: string };
    if (b.password === 'good') return HttpResponse.json({ token: 'TOK-OK' });
    return new HttpResponse('{"error":{"code":"UNAUTHORIZED"}}', { status: 401 });
  }),
  http.get('*/api/admin/devices', ({ request }) => {
    const q = new URL(request.url).searchParams.get('q') ?? '';
    return HttpResponse.json({ items: q === 'none' ? [] : [{
      id: 1, serial: 'S1', assetNo: 'A-1', model: 'SM-X200', batteryPct: 55, lastSeenAt: '2026-07-13T00:00:00Z',
      lat: null, lng: null, currentUser: { empNo: 'E100', name: '홍길동', dept: '개발' },
      indoor: { building: '본관', floor: '3', zone: '동측' },
      org1: '개발본부', location: '5층 동측', enrolled: true }] });
  }),
  http.get('*/api/admin/devices/:id', ({ params }) => HttpResponse.json({
    device: { id: Number(params.id), serial: 'S1', assetNo: 'A-1', model: 'SM-X200', wifiMac: null, knoxLicensed: false, enrolledAt: '2026-07-01T00:00:00Z', lastSeenAt: '2026-07-13T00:00:00Z' },
    currentUser: { empNo: 'E100', name: '홍길동', dept: '개발' },
    indoor: { building: '본관', floor: '3', zone: '동측' },
    recentReports: [{ id: 9, reportedAt: '2026-07-13T00:00:00Z', lat: null, lng: null, bssid: 'AP:1', ssid: 'CORP', batteryPct: 55 }],
    history: [{ id: 3, empNo: 'E100', name: '홍길동', checkedOut: '2026-07-10T00:00:00Z', returnedAt: null, consentAt: '2026-07-10T00:00:00Z' }] })),
  http.post('*/api/admin/devices/:id/ring', () => HttpResponse.json({ queued: true })),
  http.post('*/api/admin/devices/:id/locate', () => HttpResponse.json({ queued: true })),
  http.get('*/api/admin/alerts/stale', () => HttpResponse.json({ items: [{ id: 2, serial: 'STALE1', assetNo: null, lastSeenAt: '2026-07-01T00:00:00Z' }] })),
  http.put('*/api/admin/ap-map', () => HttpResponse.json({ upserted: 2 })),
];
