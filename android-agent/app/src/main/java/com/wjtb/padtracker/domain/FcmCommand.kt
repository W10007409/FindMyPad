package com.wjtb.padtracker.domain

sealed interface FcmCommand {
  data object Ring : FcmCommand
  data object LocateNow : FcmCommand

  companion object {
    fun fromData(data: Map<String, String>): FcmCommand? = when (data["command"]) {
      "RING" -> Ring
      "LOCATE_NOW" -> LocateNow
      else -> null
    }
  }
}
