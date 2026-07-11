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
    create("dev") { dimension = "target" }
    create("knox") { dimension = "target" }
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
  testImplementation("junit:junit:4.13.2")
  testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
  testImplementation("app.cash.turbine:turbine:1.1.0")
  testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}
