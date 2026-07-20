package com.wjtb.padtracker.domain

data class NearbyAp(val bssid: String, val rssi: Int, val ssid: String? = null, val frequency: Int? = null)

data class ReportSnapshot(
  val lat: Double?, val lng: Double?, val accuracyM: Float?,
  val bssid: String?, val ssid: String?, val batteryPct: Int?,
  val batteryStatus: String? = null, val batteryPlug: String? = null, val batteryTempC: Float? = null,
  val batteryHealth: String? = null, val batteryVoltageMv: Int? = null,
  val wifiRssi: Int? = null, val wifiLinkMbps: Int? = null, val wifiFreqMhz: Int? = null, val localIp: String? = null,
  val storageFreeMb: Int? = null, val storageTotalMb: Int? = null, val osVersion: String? = null, val uptimeSec: Long? = null,
  val nearbyAps: List<NearbyAp>? = null,
)
