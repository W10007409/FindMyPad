export interface Indoor { building: string | null; floor: string | null; zone: string | null }
export interface CurrentUser { empNo: string; name: string; dept: string | null }
export interface DeviceListItem {
  id: number | null; serial: string; assetNo: string | null; model: string | null;
  batteryPct: number | null; lastSeenAt: string | null; lat: number | null; lng: number | null;
  currentUser: CurrentUser | null; indoor: Indoor | null;
  org1: string | null; location: string | null; enrolled: boolean;
}
export interface DeviceRow { id: number; serial: string; assetNo: string | null; model: string | null;
  wifiMac: string | null; knoxLicensed: boolean; enrolledAt: string | null; lastSeenAt: string | null }
export interface NearbyAp { bssid: string; rssi: number; ssid?: string | null; frequency?: number | null;
  indoor?: Indoor | null }
export interface Report { id: number; reportedAt: string | null; lat: number | null; lng: number | null;
  bssid: string | null; ssid: string | null; batteryPct: number | null;
  batteryStatus: string | null; batteryPlug: string | null; batteryTempC: number | null;
  batteryHealth: string | null; batteryVoltageMv: number | null;
  wifiRssi: number | null; wifiLinkMbps: number | null; wifiFreqMhz: number | null; localIp: string | null;
  storageFreeMb: number | null; storageTotalMb: number | null; osVersion: string | null; uptimeSec: number | null;
  nearbyAps: NearbyAp[] | null }
export interface HistoryItem { id: number; empNo: string; name: string;
  checkedOut: string | null; returnedAt: string | null; consentAt: string | null }
export interface NetworkLoc { publicIp: string | null; onCorpNetwork: boolean; city?: string | null; region?: string | null }
export interface DeviceDetail { device: DeviceRow; currentUser: CurrentUser | null; indoor: Indoor | null;
  network: NetworkLoc | null; recentReports: Report[]; history: HistoryItem[] }
export interface StaleItem { id: number; serial: string; assetNo: string | null; lastSeenAt: string | null }
export interface RingResult { queued: boolean; reason?: 'no_token' | 'send_failed'; }
export interface LoginResponse { token: string; role: 'admin' | 'employee'; name: string; empNo: string; mustChangePassword: boolean }
