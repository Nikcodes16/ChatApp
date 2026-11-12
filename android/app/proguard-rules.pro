
# android/app/proguard-rules.pro

# Preserve line numbers and source information for crash reports.
-keepattributes SourceFile,LineNumberTable

# Preserve AndroidX Keep-annotated classes and members when needed.
-keep @androidx.annotation.Keep class * {
    *;
}
