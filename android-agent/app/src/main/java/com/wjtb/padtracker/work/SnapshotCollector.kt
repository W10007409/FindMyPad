package com.wjtb.padtracker.work
import android.content.Context
import android.net.wifi.WifiManager
import android.os.BatteryManager
import com.wjtb.padtracker.domain.ReportSnapshot
class SnapshotCollector(private val context: Context) {
  /** 위치는 P2에선 생략 가능(권한/Fused는 실기기 게이트) — battery/wifi만 수집, 실패 시 null */
  suspend fun collect(): ReportSnapshot {
    val battery = runCatching {
      (context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager)
        .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
    }.getOrNull()
    @Suppress("DEPRECATION")
    val info = runCatching { (context.getSystemService(Context.WIFI_SERVICE) as WifiManager).connectionInfo }.getOrNull()
    return ReportSnapshot(
      lat = null, lng = null, accuracyM = null,
      bssid = info?.bssid, ssid = info?.ssid?.trim('"'),
      batteryPct = battery,
    )
  }
}
