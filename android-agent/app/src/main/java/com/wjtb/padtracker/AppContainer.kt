package com.wjtb.padtracker
import android.content.Context
import androidx.room.Room
import com.wjtb.padtracker.core.AdminActivation
import com.wjtb.padtracker.core.DeviceControl
import com.wjtb.padtracker.core.PushService
import com.wjtb.padtracker.data.*
import com.wjtb.padtracker.data.api.ApiFactory
import com.wjtb.padtracker.data.queue.*
class AppContainer(context: Context) {
  // 플레이버별 기본 서버 URL(BuildConfig). dev=adb reverse 127.0.0.1:3000, knox=프로덕션.
  // 런타임 변경은 DeviceStore(BASE)로 오버라이드 가능.
  private val defaultBaseUrl = BuildConfig.DEFAULT_BASE_URL
  val store: DeviceStore = DataStoreDeviceStore(context, defaultBaseUrl)
  private val db = Room.databaseBuilder(context, QueueDb::class.java, "pad-queue.db").build()
  private val queue: ReportQueue = RoomReportQueue(db.dao())
  // baseUrl은 초기 default 사용(런타임 변경은 후속). 토큰은 blocking-free하게 인터셉터에서 조회.
  private val api = ApiFactory.create(defaultBaseUrl, tokenProvider = { runBlockingToken() })
  val repository = PadRepository(api, store, queue)
  val deviceControl: DeviceControl = provideDeviceControl(context) // 플레이버 바인딩
  val pushService: PushService = providePushService()               // 플레이버 바인딩
  val adminActivation: AdminActivation = provideAdminActivation()   // 플레이버 바인딩
  private fun runBlockingToken(): String? =
    kotlinx.coroutines.runBlocking { store.deviceToken() }
}
