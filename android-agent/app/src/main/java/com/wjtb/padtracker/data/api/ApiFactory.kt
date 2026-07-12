package com.wjtb.padtracker.data.api
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
object ApiFactory {
  private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
  fun create(baseUrl: String, tokenProvider: () -> String?): PadApi {
    val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(tokenProvider)).build()
    return Retrofit.Builder()
      .baseUrl(baseUrl)
      .client(client)
      .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
      .build().create(PadApi::class.java)
  }
}
