package com.wjtb.padtracker.data.api

import kotlinx.serialization.Serializable

@Serializable
data class ReportRequest(
  val lat: Double? = null, val lng: Double? = null, val accuracyM: Float? = null,
  val bssid: String? = null, val ssid: String? = null, val batteryPct: Int? = null,
)
