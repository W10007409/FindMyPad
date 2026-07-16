package com.wjtb.padtracker.work

import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlin.coroutines.coroutineContext

/**
 * The always-on reporting loop, factored out of [ReportingService] so it can be tested
 * without the Android service framework.
 *
 * Contract:
 *  - if [enrolled] returns false, [run] returns immediately without ever reporting
 *    (the service then stops itself — an un-enrolled pad has nothing to send);
 *  - otherwise it calls [reportOnce] then waits [intervalMs], repeating until the
 *    surrounding coroutine is cancelled (service destroyed).
 *
 * [delayFn] is injectable so tests can drive the loop deterministically instead of
 * waiting real wall-clock time.
 */
class ReportingLoop(
  private val enrolled: suspend () -> Boolean,
  private val reportOnce: suspend () -> Unit,
  private val intervalMs: Long,
  private val delayFn: suspend (Long) -> Unit = { delay(it) },
) {
  /**
   * @param maxCycles test hook — stop after this many report cycles. null (production)
   *   loops until the coroutine is cancelled.
   */
  suspend fun run(maxCycles: Int? = null) {
    if (!enrolled()) return
    var cycles = 0
    while (coroutineContext.isActive) {
      reportOnce()
      if (maxCycles != null && ++cycles >= maxCycles) return
      delayFn(intervalMs)
    }
  }
}
