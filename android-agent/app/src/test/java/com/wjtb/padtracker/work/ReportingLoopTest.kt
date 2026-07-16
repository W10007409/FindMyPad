package com.wjtb.padtracker.work

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReportingLoopTest {

  @Test fun does_not_report_when_not_enrolled() = runTest {
    var reports = 0
    val loop = ReportingLoop(
      enrolled = { false },
      reportOnce = { reports++ },
      intervalMs = 1000,
      delayFn = {}, // never reached
    )
    loop.run(maxCycles = 5)
    assertEquals(0, reports)
  }

  @Test fun reports_once_per_cycle_when_enrolled() = runTest {
    var reports = 0
    val loop = ReportingLoop(
      enrolled = { true },
      reportOnce = { reports++ },
      intervalMs = 1000,
      delayFn = {}, // don't actually wait
    )
    loop.run(maxCycles = 3)
    assertEquals(3, reports)
  }

  @Test fun waits_the_interval_between_cycles() = runTest {
    val waits = mutableListOf<Long>()
    val loop = ReportingLoop(
      enrolled = { true },
      reportOnce = {},
      intervalMs = 60_000,
      delayFn = { waits.add(it) },
    )
    loop.run(maxCycles = 3)
    // No trailing wait after the final cycle (loop returns right after the last report).
    assertEquals(listOf(60_000L, 60_000L), waits)
  }
}
