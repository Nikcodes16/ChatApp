package com.chatapp

import android.graphics.Color
import android.os.Bundle
import android.view.View
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    window.navigationBarColor = Color.TRANSPARENT
    

    // Content ko navigation bar ke neeche draw mat karo
    window.decorView.systemUiVisibility =
      window.decorView.systemUiVisibility and
      View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION.inv() and
      View.SYSTEM_UI_FLAG_LAYOUT_STABLE.inv()

    // Navigation buttons ko dark rakho, agar background light hai
    window.decorView.systemUiVisibility =
      window.decorView.systemUiVisibility or
      View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
  }

  override fun getMainComponentName(): String = "ChatApp"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
