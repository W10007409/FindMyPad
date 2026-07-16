package com.wjtb.padtracker.core
interface DeviceControl {
  suspend fun activateLicense(): Result<Unit>
  fun lockUninstall(): Boolean
  fun grantPermissionsSilently(perms: List<String>): Boolean
  fun disableMacRandomization(ssid: String): Boolean
  fun readSerial(): String?

  /**
   * true when the onboarding UI should let the operator type the serial in by hand.
   * dev/mock builds can't read the real hardware serial (Android 10+ blocks it for
   * non-owner apps), so they return true and prefill readSerial() as a suggestion.
   * Knox reads the real Build.getSerial() and returns false (no manual entry).
   */
  val allowsManualSerial: Boolean
}
