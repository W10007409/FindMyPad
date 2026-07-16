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
  // adb reverse tcp:3000 tcp:3000 로 기기의 127.0.0.1:3000 이 개발 PC의 서버로 향한다.
  // (에뮬레이터/실기기 모두 adb reverse 지원. 에뮬레이터 전용 10.0.2.2 보다 이식성 높음.)
  private val defaultBaseUrl = "http://127.0.0.1:3000/"
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
