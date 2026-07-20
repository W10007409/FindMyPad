import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { DeviceDetail, DeviceListItem, LoginResponse, RingResult, StaleItem } from './types';

export function useLogin() {
  return useMutation({
    mutationFn: (b: { empNo: string; password: string }) =>
      apiFetch<LoginResponse>('/admin/login', { method: 'POST', body: JSON.stringify(b) }),
  });
}
export function useChangePassword() {
  return useMutation({
    mutationFn: (b: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ ok: true }>('/auth/change-password', { method: 'POST', body: JSON.stringify(b) }),
  });
}
export function useSearchDevices(q: string) {
  return useQuery({
    queryKey: ['devices', q],
    queryFn: async () => (await apiFetch<{ items: DeviceListItem[] }>(`/admin/devices?q=${encodeURIComponent(q)}`)).items,
    enabled: q.length > 0,
  });
}
/** Employee home: GET /admin/devices with no query → the server returns the caller's own pads. */
export function useMyDevices() {
  return useQuery({
    queryKey: ['my-devices'],
    queryFn: async () => (await apiFetch<{ items: DeviceListItem[] }>(`/admin/devices`)).items,
  });
}
export function useDeviceDetail(id: number) {
  return useQuery({ queryKey: ['device', id], queryFn: () => apiFetch<DeviceDetail>(`/admin/devices/${id}`) });
}
export function useStaleDevices(days: number) {
  return useQuery({ queryKey: ['stale', days], queryFn: async () => (await apiFetch<{ items: StaleItem[] }>(`/admin/alerts/stale?days=${days}`)).items });
}
export function useRing() { return useMutation({ mutationFn: (id: number) => apiFetch<RingResult>(`/admin/devices/${id}/ring`, { method: 'POST' }) }); }
export function useLocate() { return useMutation({ mutationFn: (id: number) => apiFetch<RingResult>(`/admin/devices/${id}/locate`, { method: 'POST' }) }); }
export function useApMapUpload() { return useMutation({ mutationFn: (csv: string) => apiFetch<{ upserted: number }>('/admin/ap-map', { method: 'PUT', body: JSON.stringify({ csv }) }) }); }
