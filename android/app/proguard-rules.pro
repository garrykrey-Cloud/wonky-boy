# Wonky Boy - ProGuard / R8 rules
#
# Release builds run with minifyEnabled + shrinkResources. Capacitor resolves
# plugins and bridges JavaScript calls by REFLECTION, so anything the shrinker
# cannot see a direct call to must be kept explicitly. Without these the app
# builds cleanly and then dies at runtime with a blank WebView, which is a
# miserable thing to debug - hence the belt and braces.

# --- Capacitor core and its plugin machinery -------------------------------
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep class * extends com.getcapacitor.Plugin { *; }

# --- Cordova compatibility layer that Capacitor ships ----------------------
-keep class org.apache.cordova.** { *; }

# --- Anything reachable from JavaScript ------------------------------------
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# --- The app's own classes -------------------------------------------------
-keep class com.garry.wonkyboy.** { *; }

# --- Attributes the bridge inspects at runtime -----------------------------
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod

# --- Readable crash reports in Play Console --------------------------------
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# --- Optional deps that are not bundled ------------------------------------
-dontwarn com.google.android.gms.**
-dontwarn org.apache.cordova.**
