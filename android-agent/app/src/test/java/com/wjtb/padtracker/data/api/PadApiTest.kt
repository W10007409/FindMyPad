package com.wjtb.padtracker.data.api
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
class PadApiTest {
  private lateinit var server: MockWebServer
  private lateinit var api: PadApi
  private var token: String? = "TOK-1"
  @Before fun setUp() { server = MockWebServer(); server.start()
    api = ApiFactory.create(server.url("/").toString(), tokenProvider = { token }) }
  @After fun tearDown() { server.shutdown() }

  @Test fun enroll_parses_token() = runTest {
    server.enqueue(MockResponse().setBody("""{"deviceId":1,"assetNo":"A-1","deviceToken":"DTOK"}"""))
    val res = api.enroll(EnrollRequest(serial = "S1"))
    assertEquals("DTOK", res.deviceToken)
    val recorded = server.takeRequest()
    assertEquals("/api/devices/enroll", recorded.path)
  }
  @Test fun report_attaches_bearer() = runTest {
    server.enqueue(MockResponse().setBody("""{"reportId":9,"indoor":null}"""))
    api.report(ReportRequest(batteryPct = 50))
    val recorded = server.takeRequest()
    assertEquals("Bearer TOK-1", recorded.getHeader("Authorization"))
  }
  @Test fun report_serializes_extended_telemetry_fields() = runTest {
    server.enqueue(MockResponse().setBody("""{"reportId":9,"indoor":null}"""))
    api.report(ReportRequest(
      batteryStatus = "charging", batteryPlug = "ac", batteryTempC = 31.5f, batteryHealth = "good", batteryVoltageMv = 4123,
      wifiRssi = -47, wifiLinkMbps = 433, wifiFreqMhz = 5180, localIp = "10.0.0.12",
      storageFreeMb = 20480, storageTotalMb = 65536, osVersion = "Android 13 (SDK 33)", uptimeSec = 86400L,
      nearbyAps = listOf(NearbyApDto("aa:bb:cc:dd:ee:01", -50, "CORP", 5180)),
    ))
    val recorded = server.takeRequest()
    val body = recorded.body.readUtf8()
    assertTrue(body.contains("\"batteryStatus\":\"charging\""))
    assertTrue(body.contains("\"storageFreeMb\":20480"))
    assertTrue(body.contains("\"nearbyAps\""))
    assertTrue(body.contains("\"bssid\":\"aa:bb:cc:dd:ee:01\""))
  }
  @Test fun checkout_409_is_conflict() = runTest {
    server.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":{"code":"CONFLICT","message":"x"}}"""))
    val result = safeApiCall { api.checkout(CheckoutRequest("E100", "2026-07-12T00:00:00Z")) }
    assertTrue(result is ApiResult.Conflict)
  }
}
