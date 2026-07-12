package com.wjtb.padtracker.domain
import com.wjtb.padtracker.data.api.ReportRequest
import org.junit.Assert.assertEquals
import org.junit.Test
class ReportBuilderTest {
  private val b = ReportBuilder()
  @Test fun maps_all_fields() {
    val r = b.build(ReportSnapshot(37.5, 127.0, 30f, "AP:1", "CORP", 77))
    assertEquals(ReportRequest(37.5, 127.0, 30f, "AP:1", "CORP", 77), r)
  }
  @Test fun nulls_pass_through() {
    val r = b.build(ReportSnapshot(null, null, null, null, null, null))
    assertEquals(ReportRequest(null, null, null, null, null, null), r)
  }
}
