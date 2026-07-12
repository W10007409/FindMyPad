package com.wjtb.padtracker.domain

import com.wjtb.padtracker.data.api.ReportRequest

class ReportBuilder {
  fun build(s: ReportSnapshot): ReportRequest =
    ReportRequest(s.lat, s.lng, s.accuracyM, s.bssid, s.ssid, s.batteryPct)
}
