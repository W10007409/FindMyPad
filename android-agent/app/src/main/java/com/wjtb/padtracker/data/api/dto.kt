package com.wjtb.padtracker.data.api

import kotlinx.serialization.Serializable

@Serializable
data class NearbyApDto(val bssid: String, val rssi: Int, val ssid: String? = null, val frequency: Int? = null)

@Serializable
data class ReportRequest(
  val lat: Double? = null, val lng: Double? = null, val accuracyM: Float? = null,
  val bssid: String? = null, val ssid: String? = null, val batteryPct: Int? = null,
  val batteryStatus: String? = null, val batteryPlug: String? = null, val batteryTempC: Float? = null,
  val batteryHealth: String? = null, val batteryVoltageMv: Int? = null,
  val wifiRssi: Int? = null, val wifiLinkMbps: Int? = null, val wifiFreqMhz: Int? = null, val localIp: String? = null,
  val storageFreeMb: Int? = null, val storageTotalMb: Int? = null, val osVersion: String? = null, val uptimeSec: Long? = null,
  val nearbyAps: List<NearbyApDto>? = null,
)

@Serializable data class EnrollRequest(val serial: String, val model: String? = null, val wifiMac: String? = null, val fcmToken: String? = null)
@Serializable data class EnrollResponse(val deviceId: Long, val assetNo: String? = null, val deviceToken: String)
@Serializable data class Indoor(val building: String? = null, val floor: String? = null, val zone: String? = null)
@Serializable data class ReportResponse(val reportId: Long, val indoor: Indoor? = null)
@Serializable data class CheckoutRequest(val empNo: String, val consentAt: String)
@Serializable data class CheckoutResponse(val checkoutId: Long, val userId: Long)
@Serializable data class ReturnResponse(val checkoutId: Long, val returnedAt: String? = null)
