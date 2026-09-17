import 'package:flutter/material.dart';

/// Brand tokens copied from the real Jobiest design system
/// (`app/globals.css`): deep warm petrol ink on warm ivory, teal brand.
class BrandColors {
  static const Color brand = Color(0xFF0BA5A0);
  static const Color brandStrong = Color(0xFF067A7C);
  static const Color brandSoft = Color(0xFFE4F4F2);
  static const Color brandLine = Color(0xFFAEE0DB);

  static const Color ink = Color(0xFF14201F);
  static const Color inkSoft = Color(0xFF0C2A2E);
  static const Color muted = Color(0xFF57524A);
  static const Color line = Color(0xFFE7E1D4);
  static const Color bg = Color(0xFFFAF8F3);
  static const Color card = Color(0xFFFFFFFF);

  static const Color success = Color(0xFF16A34A);
  static const Color successBg = Color(0xFFF0FDF4);
  static const Color warning = Color(0xFFD97706);
  static const Color warningBg = Color(0xFFFFFBEB);
  static const Color danger = Color(0xFFDC2626);
  static const Color dangerBg = Color(0xFFFEF2F2);
}

class AppTheme {
  static ThemeData light() {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: BrandColors.brand,
      onPrimary: Colors.white,
      primaryContainer: BrandColors.brandSoft,
      onPrimaryContainer: BrandColors.brandStrong,
      secondary: BrandColors.ink,
      onSecondary: Colors.white,
      error: BrandColors.danger,
      onError: Colors.white,
      surface: BrandColors.card,
      onSurface: BrandColors.ink,
      surfaceContainerHighest: BrandColors.bg,
      onSurfaceVariant: BrandColors.muted,
      outline: BrandColors.line,
      outlineVariant: BrandColors.line,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: BrandColors.bg,
      splashFactory: InkRipple.splashFactory,
    );

    return base.copyWith(
      appBarTheme: const AppBarTheme(
        backgroundColor: BrandColors.ink,
        foregroundColor: Colors.white,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: Colors.white,
          fontSize: 19,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.2,
        ),
      ),
      cardTheme: CardTheme(
        color: BrandColors.card,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: BrandColors.line),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: BrandColors.card,
        indicatorColor: BrandColors.brandSoft,
        elevation: 3,
        height: 68,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 11.5,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w700
                : FontWeight.w500,
            color: states.contains(WidgetState.selected)
                ? BrandColors.brandStrong
                : BrandColors.muted,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? BrandColors.brandStrong
                : BrandColors.muted,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BrandColors.card,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.brand, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: BrandColors.danger),
        ),
        labelStyle: const TextStyle(color: BrandColors.muted),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: BrandColors.brand,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(50),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: BrandColors.ink,
          minimumSize: const Size.fromHeight(48),
          side: const BorderSide(color: BrandColors.line),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: BrandColors.brandStrong),
      ),
      dividerTheme: const DividerThemeData(color: BrandColors.line, thickness: 1, space: 1),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: BrandColors.brandSoft,
        side: const BorderSide(color: BrandColors.brandLine),
        labelStyle: const TextStyle(
          color: BrandColors.brandStrong,
          fontWeight: FontWeight.w600,
          fontSize: 12.5,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      listTileTheme: const ListTileThemeData(
        iconColor: BrandColors.brandStrong,
        textColor: BrandColors.ink,
      ),
      snackBarTheme: const SnackBarThemeData(
        backgroundColor: BrandColors.ink,
        contentTextStyle: TextStyle(color: Colors.white),
        behavior: SnackBarBehavior.floating,
      ),
      progressIndicatorTheme:
          const ProgressIndicatorThemeData(color: BrandColors.brand),
    );
  }
}
