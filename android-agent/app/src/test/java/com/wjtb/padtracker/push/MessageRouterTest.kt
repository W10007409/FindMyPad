package com.wjtb.padtracker.push

import com.wjtb.padtracker.domain.FcmCommand
import org.junit.Assert.*
import org.junit.Test

class MessageRouterTest {
  @Test fun routes_ring() { assertEquals(FcmCommand.Ring, MessageRouter.route(mapOf("command" to "RING"))) }
  @Test fun routes_unknown_null() { assertNull(MessageRouter.route(mapOf("x" to "y"))) }
}
