package com.wjtb.padtracker.data
import com.wjtb.padtracker.data.api.ApiResult
import com.wjtb.padtracker.data.api.CheckoutResponse
import com.wjtb.padtracker.data.api.EnrollResponse
import com.wjtb.padtracker.domain.ConsentInfo

fun interface Checkoutable {
  suspend fun checkout(info: ConsentInfo): ApiResult<CheckoutResponse>
}
fun interface Enrollable {
  suspend fun enroll(serial: String, model: String?, wifiMac: String?, fcmToken: String?): ApiResult<EnrollResponse>
}
