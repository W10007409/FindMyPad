package com.wjtb.padtracker.data.queue
import com.wjtb.padtracker.data.api.ReportRequest

data class QueuedReport(val id: Long, val request: ReportRequest)

interface ReportQueue {
  suspend fun enqueue(r: ReportRequest)
  suspend fun all(): List<QueuedReport>
  suspend fun remove(id: Long)
}

/** 큐의 각 보고를 sender로 전송, 성공분만 제거. 순수 오케스트레이션. */
suspend fun flushQueue(queue: ReportQueue, sender: suspend (ReportRequest) -> Boolean) {
  for (item in queue.all()) { if (sender(item.request)) queue.remove(item.id) }
}
