package com.wjtb.padtracker.core
interface PushService {
  suspend fun currentToken(): String?
}
