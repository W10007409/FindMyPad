package com.wjtb.padtracker.core
class MockDeviceControl(private val androidId: String) : DeviceControl {
  override suspend fun activateLicense(): Result<Unit> = Result.success(Unit)
  override fun lockUninstall(): Boolean = true
  override fun grantPermissionsSilently(perms: List<String>): Boolean = true
  override fun disableMacRandomization(ssid: String): Boolean = true
  override fun readSerial(): String? = androidId
  override val allowsManualSerial: Boolean = true
}
