package com.wjtb.padtracker.core
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
class MockDeviceControlTest {
  private val dc = MockDeviceControl(androidId = "ANDROID-123")
  @Test fun activateLicense_succeeds() = runTest { assertTrue(dc.activateLicense().isSuccess) }
  @Test fun locks_and_grants_are_true() {
    assertTrue(dc.lockUninstall())
    assertTrue(dc.grantPermissionsSilently(listOf("android.permission.ACCESS_FINE_LOCATION")))
    assertTrue(dc.disableMacRandomization("CORP-WIFI"))
  }
  @Test fun readSerial_returns_androidId() { assertEquals("ANDROID-123", dc.readSerial()) }
  @Test fun allows_manual_serial_in_dev() { assertTrue(dc.allowsManualSerial) }
}
