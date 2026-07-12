package com.wjtb.padtracker.data.api
import okhttp3.Interceptor
import okhttp3.Response
class AuthInterceptor(private val tokenProvider: () -> String?) : Interceptor {
  override fun intercept(chain: Interceptor.Chain): Response {
    val token = tokenProvider()
    val req = if (token != null)
      chain.request().newBuilder().addHeader("Authorization", "Bearer $token").build()
    else chain.request()
    return chain.proceed(req)
  }
}
