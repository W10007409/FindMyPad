package com.wjtb.padtracker.data.api
import retrofit2.HttpException
sealed interface ApiResult<out T> {
  data class Ok<T>(val value: T) : ApiResult<T>
  data object Conflict : ApiResult<Nothing>
  data class Error(val cause: Throwable) : ApiResult<Nothing>
}
suspend fun <T> safeApiCall(block: suspend () -> T): ApiResult<T> = try {
  ApiResult.Ok(block())
} catch (e: HttpException) {
  if (e.code() == 409) ApiResult.Conflict else ApiResult.Error(e)
} catch (e: Exception) { ApiResult.Error(e) }
