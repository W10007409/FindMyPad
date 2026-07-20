package com.wjtb.padtracker.work
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.WifiManager
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import com.wjtb.padtracker.domain.NearbyAp
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

    // 배터리 상세: ACTION_BATTERY_CHANGED sticky intent (한 번만 등록해 재사용)
    val battIntent = runCatching {
      context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    }.getOrNull()
    val batteryStatus = runCatching {
      when (battIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1)) {
        BatteryManager.BATTERY_STATUS_CHARGING -> "charging"
        BatteryManager.BATTERY_STATUS_DISCHARGING -> "discharging"
        BatteryManager.BATTERY_STATUS_FULL -> "full"
        BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "not_charging"
        else -> null
      }
    }.getOrNull()
    val batteryPlug = runCatching {
      when (battIntent?.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)) {
        BatteryManager.BATTERY_PLUGGED_AC -> "ac"
        BatteryManager.BATTERY_PLUGGED_USB -> "usb"
        BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
        else -> null
      }
    }.getOrNull()
    val batteryTempC = runCatching {
      val tenths = battIntent?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE) ?: Int.MIN_VALUE
      if (tenths == Int.MIN_VALUE) null else tenths / 10f
    }.getOrNull()
    val batteryHealth = runCatching {
      when (battIntent?.getIntExtra(BatteryManager.EXTRA_HEALTH, -1)) {
        BatteryManager.BATTERY_HEALTH_GOOD -> "good"
        BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
        BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
        BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over_voltage"
        BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "unspecified_failure"
        BatteryManager.BATTERY_HEALTH_COLD -> "cold"
        else -> null
      }
    }.getOrNull()
    val batteryVoltageMv = runCatching {
      val v = battIntent?.getIntExtra(BatteryManager.EXTRA_VOLTAGE, Int.MIN_VALUE) ?: Int.MIN_VALUE
      if (v == Int.MIN_VALUE) null else v
    }.getOrNull()

    // wifi: connectionInfo (RSSI/linkSpeed/frequency/ipAddress)
    val wifiRssi = runCatching { info?.rssi }.getOrNull()
    val wifiLinkMbps = runCatching { info?.linkSpeed }.getOrNull()
    val wifiFreqMhz = runCatching { info?.frequency }.getOrNull()
    val localIp = runCatching {
      val ip = info?.ipAddress ?: return@runCatching null
      if (ip == 0) null else String.format(
        "%d.%d.%d.%d",
        ip and 0xff, (ip shr 8) and 0xff, (ip shr 16) and 0xff, (ip shr 24) and 0xff
      )
    }.getOrNull()

    // nearbyAps: 캐시된 scanResults 사용(강제 startScan() 금지 — 배터리 절약)
    val nearbyAps = runCatching {
      (context.getSystemService(Context.WIFI_SERVICE) as WifiManager).scanResults.map {
        NearbyAp(bssid = it.BSSID, rssi = it.level, ssid = it.SSID, frequency = it.frequency)
      }
    }.getOrNull()

    // storage: StatFs(Environment.getDataDirectory().path) → availableBytes/totalBytes / 1MB
    val storageFreeMb = runCatching {
      (StatFs(Environment.getDataDirectory().path).availableBytes / (1024L * 1024L)).toInt()
    }.getOrNull()
    val storageTotalMb = runCatching {
      (StatFs(Environment.getDataDirectory().path).totalBytes / (1024L * 1024L)).toInt()
    }.getOrNull()

    val osVersion = runCatching { "Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})" }.getOrNull()
    val uptimeSec = runCatching { SystemClock.elapsedRealtime() / 1000 }.getOrNull()

    return ReportSnapshot(
      lat = null, lng = null, accuracyM = null,
      bssid = info?.bssid, ssid = info?.ssid?.trim('"'),
      batteryPct = battery,
      batteryStatus = batteryStatus, batteryPlug = batteryPlug, batteryTempC = batteryTempC,
      batteryHealth = batteryHealth, batteryVoltageMv = batteryVoltageMv,
      wifiRssi = wifiRssi, wifiLinkMbps = wifiLinkMbps, wifiFreqMhz = wifiFreqMhz, localIp = localIp,
      storageFreeMb = storageFreeMb, storageTotalMb = storageTotalMb, osVersion = osVersion, uptimeSec = uptimeSec,
      nearbyAps = nearbyAps,
    )
  }
}
