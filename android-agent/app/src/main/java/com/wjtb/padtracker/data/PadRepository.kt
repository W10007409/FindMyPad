package com.wjtb.padtracker.data
import com.wjtb.padtracker.data.api.*
import com.wjtb.padtracker.data.queue.ReportQueue
import com.wjtb.padtracker.data.queue.flushQueue
import com.wjtb.padtracker.domain.*
import com.wjtb.padtracker.ui.checkout.Checkoutable
import com.wjtb.padtracker.ui.enrollment.Enrollable

class PadRepository(
  private val api: PadApi,
  private val store: DeviceStore,
  private val queue: ReportQueue,
  private val builder: ReportBuilder = ReportBuilder(),
) : Checkoutable, Enrollable {
  override suspend fun enroll(serial: String, model: String?, wifiMac: String?, fcmToken: String?): ApiResult<EnrollResponse> {
    val r = safeApiCall { api.enroll(EnrollRequest(serial, model, wifiMac, fcmToken)) }
    if (r is ApiResult.Ok) store.setDeviceToken(r.value.deviceToken)
    return r
  }
  override suspend fun checkout(info: ConsentInfo): ApiResult<CheckoutResponse> {
    val r = safeApiCall { api.checkout(CheckoutRequest(info.empNo, info.consentAtIso)) }
    if (r is ApiResult.Ok) store.setCheckoutState(CheckoutState.CheckedOut(r.value.checkoutId, info.empNo))
    return r
  }
  suspend fun returnDevice(): ApiResult<ReturnResponse> {
    val cur = store.checkoutState()
    if (cur !is CheckoutState.CheckedOut) return ApiResult.Error(IllegalStateException("not checked out"))
    val r = safeApiCall { api.returnDevice(cur.checkoutId) }
    if (r is ApiResult.Ok) store.setCheckoutState(CheckoutState.NotCheckedOut)
    return r
  }
  suspend fun sendReport(snap: ReportSnapshot): ApiResult<ReportResponse> {
    val r = safeApiCall { api.report(builder.build(snap)) }
    if (r is ApiResult.Error) queue.enqueue(builder.build(snap))
    return r
  }
  suspend fun flushQueue() = flushQueue(queue) { req -> safeApiCall { api.report(req) } is ApiResult.Ok }
}
