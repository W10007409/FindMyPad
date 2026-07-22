import java.util.Properties

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
  id("org.jetbrains.kotlin.plugin.compose")
  id("org.jetbrains.kotlin.plugin.serialization")
  id("com.google.devtools.ksp")
}
// FCM: apply google-services only if the key is present (P2 builds without it)
if (file("google-services.json").exists()) {
  apply(plugin = "com.google.gms.google-services")
}

// local.properties(커밋 금지)에서 시크릿을 읽는다.
val localProps = Properties().apply {
  val f = rootProject.file("local.properties")
  if (f.exists()) f.inputStream().use { load(it) }
}
// Knox Premium Emulation (KPE) license key — 없으면 "" (런타임 KPE 활성화에만 필요).
val kpeLicenseKey: String = localProps.getProperty("KPE_LICENSE_KEY", "")
// 릴리스 서명 keystore — local.properties에 KEYSTORE_FILE 이 있으면 release 서명, 없으면 unsigned(빌드는 성공).
val releaseKeystoreFile: String? = localProps.getProperty("KEYSTORE_FILE")
// knox(프로덕션) 기본 서버 URL. local.properties의 PROD_BASE_URL로 오버라이드 가능. 끝에 '/' 포함.
val prodBaseUrl: String = localProps.getProperty("PROD_BASE_URL", "https://wjtools.wjthinkbig.com/FindMyPad/")
android {
  namespace = "com.wjtb.padtracker"
  compileSdk = 34
  defaultConfig {
    applicationId = "com.wjtb.padtracker"
    minSdk = 26
    targetSdk = 34
    versionCode = 1
    versionName = "0.1.0"
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }
  flavorDimensions += "target"
  productFlavors {
    // dev = Knox 없는 앱(Mock 기기제어 + 실 FCM). debug=로컬, release=프로덕션(출시 빌드).
    create("dev") { dimension = "target" }
    // knox = (보류) Knox 강제기능. KPE 라이선스+삼성 서버 접근 필요. 출시엔 미사용.
    create("knox") {
      dimension = "target"
      buildConfigField("String", "KPE_LICENSE_KEY", "\"$kpeLicenseKey\"")
    }
  }
  signingConfigs {
    create("release") {
      if (releaseKeystoreFile != null) {
        storeFile = file(releaseKeystoreFile)
        storePassword = localProps.getProperty("KEYSTORE_PASSWORD")
        keyAlias = localProps.getProperty("KEY_ALIAS")
        keyPassword = localProps.getProperty("KEY_PASSWORD")
      }
    }
  }
  buildTypes {
    getByName("debug") {
      // 로컬 개발: adb reverse 127.0.0.1:3000 (cleartext는 src/debug 매니페스트에서 허용)
      buildConfigField("String", "DEFAULT_BASE_URL", "\"http://127.0.0.1:3000/\"")
    }
    getByName("release") {
      isMinifyEnabled = false
      // keystore 정보가 있을 때만 서명(없으면 unsigned release).
      if (releaseKeystoreFile != null) signingConfig = signingConfigs.getByName("release")
      // 프로덕션 서버 URL(HTTPS). local.properties PROD_BASE_URL 로 오버라이드.
      buildConfigField("String", "DEFAULT_BASE_URL", "\"$prodBaseUrl\"")
    }
  }
  buildFeatures { compose = true; buildConfig = true }
  compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
  kotlinOptions { jvmTarget = "17" }
  testOptions { unitTests { isReturnDefaultValues = true } }
  packaging { resources { excludes += "/META-INF/{AL2.0,LGPL2.1}" } }
}
dependencies {
  val composeBom = platform("androidx.compose:compose-bom:2024.09.00")
  implementation(composeBom)
  implementation("androidx.core:core-ktx:1.13.1")
  implementation("androidx.activity:activity-compose:1.9.2")
  implementation("androidx.compose.ui:ui")
  implementation("androidx.compose.material3:material3")
  // Provides the XML "Theme.Material3.DayNight.NoActionBar" style referenced by AndroidManifest.xml.
  // Not in the brief's original dependency list; added because AAPT resource linking failed without it
  // (androidx.compose.material3 only ships Compose APIs, no XML themes).
  implementation("com.google.android.material:material:1.12.0")
  implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
  implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
  implementation("com.squareup.retrofit2:retrofit:2.11.0")
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.1")
  implementation("com.jakewharton.retrofit:retrofit2-kotlinx-serialization-converter:1.0.0")
  implementation("androidx.room:room-runtime:2.6.1")
  implementation("androidx.room:room-ktx:2.6.1")
  ksp("androidx.room:room-compiler:2.6.1")
  implementation("androidx.datastore:datastore-preferences:1.1.1")
  implementation("androidx.work:work-runtime-ktx:2.9.1")
  implementation("com.google.android.gms:play-services-location:21.3.0")
  implementation(platform("com.google.firebase:firebase-bom:33.3.0"))
  implementation("com.google.firebase:firebase-messaging")
  "knoxImplementation"(files("libs/knoxsdk.jar"))
  testImplementation("junit:junit:4.13.2")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
  testImplementation("app.cash.turbine:turbine:1.1.0")
  testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}
