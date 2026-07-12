package com.wjtb.padtracker.core
/** P4에서 knoxsdk.jar로 구현. P2에선 컴파일용 스텁. */
class KnoxDeviceControl : DeviceControl {
  override suspend fun activateLicense(): Result<Unit> = TODO("P4: Knox license activation")
  override fun lockUninstall(): Boolean = TODO("P4")
  override fun grantPermissionsSilently(perms: List<String>): Boolean = TODO("P4")
  override fun disableMacRandomization(ssid: String): Boolean = TODO("P4")
  override fun readSerial(): String? = TODO("P4")
}
