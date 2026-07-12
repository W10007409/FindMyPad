package com.wjtb.padtracker.domain

data class ReportSnapshot(
  val lat: Double?, val lng: Double?, val accuracyM: Float?,
  val bssid: String?, val ssid: String?, val batteryPct: Int?,
)
