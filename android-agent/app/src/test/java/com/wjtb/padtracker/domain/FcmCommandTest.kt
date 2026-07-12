package com.wjtb.padtracker.domain

import org.junit.Assert.*
import org.junit.Test

class FcmCommandTest {
  @Test fun ring() { assertEquals(FcmCommand.Ring, FcmCommand.fromData(mapOf("command" to "RING"))) }
  @Test fun locate() { assertEquals(FcmCommand.LocateNow, FcmCommand.fromData(mapOf("command" to "LOCATE_NOW"))) }
  @Test fun unknown_is_null() { assertNull(FcmCommand.fromData(mapOf("command" to "NOPE"))) }
  @Test fun missing_is_null() { assertNull(FcmCommand.fromData(emptyMap())) }
}
