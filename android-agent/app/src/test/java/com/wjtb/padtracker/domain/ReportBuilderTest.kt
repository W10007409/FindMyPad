package com.wjtb.padtracker.domain
import com.wjtb.padtracker.data.api.ReportRequest
import org.junit.Assert.assertEquals
import org.junit.Test
class ReportBuilderTest {
  private val b = ReportBuilder()
  @Test fun maps_all_fields() {
    val r = b.build(ReportSnapshot(37.5, 127.0, 30f, "AP:1", "CORP", 77))
    assertEquals(ReportRequest(37.5, 127.0, 30f, "AP:1", "CORP", 77), r)
  }
  @Test fun nulls_pass_through() {
    val r = b.build(ReportSnapshot(null, null, null, null, null, null))
    assertEquals(ReportRequest(null, null, null, null, null, null), r)
  }
  @Test fun maps_all_extended_fields() {
    val snap = ReportSnapshot(
      lat = null, lng = null, accuracyM = null, bssid = "b", ssid = "s", batteryPct = 55,
      batteryStatus = "charging", batteryPlug = "ac", batteryTempC = 31.5f, batteryHealth = "good", batteryVoltageMv = 4123,
      wifiRssi = -47, wifiLinkMbps = 433, wifiFreqMhz = 5180, localIp = "10.0.0.12",
      storageFreeMb = 20480, storageTotalMb = 65536, osVersion = "Android 13 (SDK 33)", uptimeSec = 86400L,
      nearbyAps = listOf(NearbyAp("aa:bb:cc:dd:ee:01", -50, "CORP", 5180)),
    )
    val req = ReportBuilder().build(snap)
    assertEquals("charging", req.batteryStatus)
    assertEquals(20480, req.storageFreeMb)
    assertEquals("aa:bb:cc:dd:ee:01", req.nearbyAps?.first()?.bssid)
  }
}
