package com.wjtb.padtracker
import android.content.Context
import androidx.room.Room
import com.wjtb.padtracker.data.*
import com.wjtb.padtracker.data.api.ApiFactory
import com.wjtb.padtracker.data.queue.*
class AppContainer(context: Context) {
  private val defaultBaseUrl = "http://10.0.2.2:3000/"
  val store: DeviceStore = DataStoreDeviceStore(context, defaultBaseUrl)
  private val db = Room.databaseBuilder(context, QueueDb::class.java, "pad-queue.db").build()
  private val queue: ReportQueue = RoomReportQueue(db.dao())
  private val api = ApiFactory.create(defaultBaseUrl, tokenProvider = { runBlockingToken() })
  val repository = PadRepository(api, store, queue)
  private fun runBlockingToken(): String? = kotlinx.coroutines.runBlocking { store.deviceToken() }
}
