package com.wjtb.padtracker.data
import com.wjtb.padtracker.data.api.*
import com.wjtb.padtracker.data.queue.*
import com.wjtb.padtracker.domain.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class FakeStore : DeviceStore {
  var token: String? = null; var checkout: CheckoutState = CheckoutState.NotCheckedOut
  override suspend fun deviceToken() = token
  override suspend fun setDeviceToken(t: String?) { token = t }
  override suspend fun checkoutState() = checkout
  override suspend fun setCheckoutState(s: CheckoutState) { checkout = s }
  override suspend fun baseUrl() = "http://x/"
}

class FakePadApi(
  private val enroll: (suspend (EnrollRequest) -> EnrollResponse)? = null,
  private val report: (suspend (ReportRequest) -> ReportResponse)? = null,
  private val checkout: (suspend (CheckoutRequest) -> CheckoutResponse)? = null,
  private val returnDevice: (suspend (Long) -> ReturnResponse)? = null,
) : PadApi {
  override suspend fun enroll(body: EnrollRequest): EnrollResponse =
    enroll?.invoke(body) ?: throw NotImplementedError()
  override suspend fun report(body: ReportRequest): ReportResponse =
    report?.invoke(body) ?: throw NotImplementedError()
  override suspend fun checkout(body: CheckoutRequest): CheckoutResponse =
    checkout?.invoke(body) ?: throw NotImplementedError()
  override suspend fun returnDevice(id: Long): ReturnResponse =
    returnDevice?.invoke(id) ?: throw NotImplementedError()
}

class PadRepositoryTest {
  private val store = FakeStore()
  private val queue = FakeReportQueue()
  private fun repo(api: PadApi) = PadRepository(api, store, queue)

  @Test fun enroll_persists_token() = runTest {
    val api = FakePadApi(enroll = { EnrollResponse(1, "A-1", "DTOK") })
    val res = repo(api).enroll("S1", null, null, null)
    assertTrue(res is ApiResult.Ok); assertEquals("DTOK", store.token)
  }
  @Test fun checkout_conflict_keeps_state() = runTest {
    val api = FakePadApi(checkout = { throw retrofit2.HttpException(retrofit2.Response.error<Any>(409, okhttp3.ResponseBody.create(null, "{}"))) })
    val res = repo(api).checkout(ConsentInfo("E100", "2026-07-12T00:00:00Z"))
    assertTrue(res is ApiResult.Conflict); assertEquals(CheckoutState.NotCheckedOut, store.checkout)
  }
  @Test fun checkout_ok_sets_state() = runTest {
    val api = FakePadApi(checkout = { CheckoutResponse(55, 7) })
    repo(api).checkout(ConsentInfo("E100", "2026-07-12T00:00:00Z"))
    assertEquals(CheckoutState.CheckedOut(55, "E100"), store.checkout)
  }
  @Test fun sendReport_queues_on_failure() = runTest {
    val api = FakePadApi(report = { throw RuntimeException("net") })
    val res = repo(api).sendReport(ReportSnapshot(null,null,null,null,null,50))
    assertTrue(res is ApiResult.Error); assertEquals(1, queue.items.size)
  }
}
