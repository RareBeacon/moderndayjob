# Keep kotlinx-serialization generated serializers (reflective lookup by the
# content-negotiation layer).
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class com.jobiest.app.**$$serializer { *; }
-keepclassmembers class com.jobiest.app.** { *** Companion; }
-keepclasseswithmembers class com.jobiest.app.** { kotlinx.serialization.KSerializer serializer(...); }
