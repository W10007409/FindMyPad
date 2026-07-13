package com.wjtb.padtracker.data.queue
import androidx.room.*
import com.wjtb.padtracker.data.api.ReportRequest
import kotlinx.serialization.json.Json

@Entity(tableName = "report_queue")
data class ReportEntity(@PrimaryKey(autoGenerate = true) val id: Long = 0, val payloadJson: String)

@Dao interface ReportQueueDao {
  @Insert suspend fun insert(e: ReportEntity): Long
  @Query("SELECT * FROM report_queue ORDER BY id ASC") suspend fun all(): List<ReportEntity>
  @Query("DELETE FROM report_queue WHERE id = :id") suspend fun delete(id: Long)
}
@Database(entities = [ReportEntity::class], version = 1, exportSchema = false)
abstract class QueueDb : RoomDatabase() { abstract fun dao(): ReportQueueDao }

class RoomReportQueue(private val dao: ReportQueueDao) : ReportQueue {
  private val json = Json { explicitNulls = false }
  override suspend fun enqueue(r: ReportRequest) { dao.insert(ReportEntity(payloadJson = json.encodeToString(ReportRequest.serializer(), r))) }
  override suspend fun all(): List<QueuedReport> = dao.all().map { QueuedReport(it.id, json.decodeFromString(ReportRequest.serializer(), it.payloadJson)) }
  override suspend fun remove(id: Long) = dao.delete(id)
}
