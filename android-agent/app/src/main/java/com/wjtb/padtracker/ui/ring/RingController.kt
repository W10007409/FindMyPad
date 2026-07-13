package com.wjtb.padtracker.ui.ring

/**
 * Pure state holder for the ring-alarm flow. Knows nothing about Android — RingActivity supplies
 * onStart/onStop callbacks that drive AudioManager/RingtoneManager. This separation is what makes
 * the ringing lifecycle unit-testable without an Android runtime.
 */
class RingController(
  private val onStart: () -> Unit = {},
  private val onStop: () -> Unit = {},
) {
  var isRinging: Boolean = false
    private set

  fun start() {
    if (!isRinging) {
      isRinging = true
      onStart()
    }
  }

  fun stop() {
    if (isRinging) {
      isRinging = false
      onStop()
    }
  }
}
