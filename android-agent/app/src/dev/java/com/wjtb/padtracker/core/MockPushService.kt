package com.wjtb.padtracker.core
class MockPushService : PushService {
  override suspend fun currentToken() = "dev-mock-token"
}
