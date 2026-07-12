package com.wjtb.padtracker.data.api
import retrofit2.http.*
interface PadApi {
  @POST("api/devices/enroll") suspend fun enroll(@Body body: EnrollRequest): EnrollResponse
  @POST("api/reports") suspend fun report(@Body body: ReportRequest): ReportResponse
  @POST("api/checkouts") suspend fun checkout(@Body body: CheckoutRequest): CheckoutResponse
  @POST("api/checkouts/{id}/return") suspend fun returnDevice(@Path("id") id: Long): ReturnResponse
}
