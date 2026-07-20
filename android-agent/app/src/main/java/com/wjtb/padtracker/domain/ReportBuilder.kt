package com.wjtb.padtracker.domain

import com.wjtb.padtracker.data.api.NearbyApDto
import com.wjtb.padtracker.data.api.ReportRequest

class ReportBuilder {
  fun build(s: ReportSnapshot): ReportRequest = ReportRequest(
    lat = s.lat, lng = s.lng, accuracyM = s.accuracyM, bssid = s.bssid, ssid = s.ssid, batteryPct = s.batteryPct,
    batteryStatus = s.batteryStatus, batteryPlug = s.batteryPlug, batteryTempC = s.batteryTempC,
    batteryHealth = s.batteryHealth, batteryVoltageMv = s.batteryVoltageMv,
    wifiRssi = s.wifiRssi, wifiLinkMbps = s.wifiLinkMbps, wifiFreqMhz = s.wifiFreqMhz, localIp = s.localIp,
    storageFreeMb = s.storageFreeMb, storageTotalMb = s.storageTotalMb, osVersion = s.osVersion, uptimeSec = s.uptimeSec,
    nearbyAps = s.nearbyAps?.map { NearbyApDto(it.bssid, it.rssi, it.ssid, it.frequency) },
  )
}
