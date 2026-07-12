package com.wjtb.padtracker.work
import org.junit.Assert.assertEquals
import org.junit.Test
class ReportSchedulerTest {
  @Test fun interval_is_15_minutes() { assertEquals(15L, ReportScheduler.INTERVAL_MINUTES) }
}
