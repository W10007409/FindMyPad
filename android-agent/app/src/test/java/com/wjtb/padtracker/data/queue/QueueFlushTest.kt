package com.wjtb.padtracker.data.queue
import com.wjtb.padtracker.data.api.ReportRequest
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class FakeReportQueue : ReportQueue {
  val items = mutableListOf<QueuedReport>(); private var seq = 1L
  override suspend fun enqueue(r: ReportRequest) { items.add(QueuedReport(seq++, r)) }
  override suspend fun all() = items.toList()
  override suspend fun remove(id: Long) { items.removeAll { it.id == id } }
}
class QueueFlushTest {
  @Test fun flush_sends_and_removes_on_success() = runTest {
    val q = FakeReportQueue(); q.enqueue(ReportRequest(batteryPct = 1)); q.enqueue(ReportRequest(batteryPct = 2))
    val sent = mutableListOf<ReportRequest>()
    flushQueue(q) { r -> sent.add(r); true } // sender returns success
    assertEquals(2, sent.size); assertTrue(q.all().isEmpty())
  }
  @Test fun flush_keeps_on_failure() = runTest {
    val q = FakeReportQueue(); q.enqueue(ReportRequest(batteryPct = 1))
    flushQueue(q) { false } // sender fails
    assertEquals(1, q.all().size) // retried next time
  }
}
