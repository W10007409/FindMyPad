package com.wjtb.padtracker.core
interface DeviceControl {
  suspend fun activateLicense(): Result<Unit>
  fun lockUninstall(): Boolean
  fun grantPermissionsSilently(perms: List<String>): Boolean
  fun disableMacRandomization(ssid: String): Boolean
  fun readSerial(): String?
}
