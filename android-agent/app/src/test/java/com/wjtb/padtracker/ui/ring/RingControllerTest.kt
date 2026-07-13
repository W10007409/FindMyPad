package com.wjtb.padtracker.ui.ring

import org.junit.Assert.*
import org.junit.Test

class RingControllerTest {
  @Test fun starts_stopped_then_ringing_then_stopped() {
    val c = RingController()
    assertFalse(c.isRinging)
    c.start(); assertTrue(c.isRinging)
    c.stop(); assertFalse(c.isRinging)
  }
}
