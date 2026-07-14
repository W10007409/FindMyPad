import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from './client';
import type { DeviceDetail, DeviceListItem, StaleItem } from './types';

export function useLogin() {
  return useMutation({
    mutationFn: (b: { username: string; password: string }) =>
      apiFetch<{ token: string }>('/admin/login', { method: 'POST', body: JSON.stringify(b) }),
  });
}
export function useSearchDevices(q: string) {
  return useQuery({
    queryKey: ['devices', q],
    queryFn: async () => (await apiFetch<{ items: DeviceListItem[] }>(`/admin/devices?q=${encodeURIComponent(q)}`)).items,
    enabled: q.length > 0,
  });
}
export function useDeviceDetail(id: number) {
  return useQuery({ queryKey: ['device', id], queryFn: () => apiFetch<DeviceDetail>(`/admin/devices/${id}`) });
}
export function useStaleDevices(days: number) {
  return useQuery({ queryKey: ['stale', days], queryFn: async () => (await apiFetch<{ items: StaleItem[] }>(`/admin/alerts/stale?days=${days}`)).items });
}
export function useRing() { return useMutation({ mutationFn: (id: number) => apiFetch<{ queued: true }>(`/admin/devices/${id}/ring`, { method: 'POST' }) }); }
export function useLocate() { return useMutation({ mutationFn: (id: number) => apiFetch<{ queued: true }>(`/admin/devices/${id}/locate`, { method: 'POST' }) }); }
export function useApMapUpload() { return useMutation({ mutationFn: (csv: string) => apiFetch<{ upserted: number }>('/admin/ap-map', { method: 'PUT', body: JSON.stringify({ csv }) }) }); }
