package com.wjtb.padtracker.push

import com.wjtb.padtracker.domain.FcmCommand

object MessageRouter {
  fun route(data: Map<String, String>): FcmCommand? = FcmCommand.fromData(data)
}
