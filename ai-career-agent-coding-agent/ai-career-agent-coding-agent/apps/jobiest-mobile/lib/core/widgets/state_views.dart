import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.label});

  final String? label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const SizedBox(
            width: 26,
            height: 26,
            child: CircularProgressIndicator(strokeWidth: 2.6),
          ),
          if (label != null) ...<Widget>[
            const SizedBox(height: 14),
            Text(label!, style: const TextStyle(color: BrandColors.muted)),
          ],
        ],
      ),
    );
  }
}

/// Error state with a retry action. Always shows the real message the backend
/// (or the network layer) produced.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry, this.retryLabel = 'Try again'});

  final String message;
  final VoidCallback? onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.cloud_off_outlined, size: 42, color: BrandColors.muted),
            const SizedBox(height: 14),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: BrandColors.ink, fontSize: 15, height: 1.4),
            ),
            if (onRetry != null) ...<Widget>[
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 18),
                label: Text(retryLabel),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(160, 44),
                  foregroundColor: BrandColors.brandStrong,
                  side: const BorderSide(color: BrandColors.brandLine),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.title,
    this.message,
    this.icon = Icons.inbox_outlined,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String? message;
  final IconData icon;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: const BoxDecoration(
                color: BrandColors.brandSoft,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 30, color: BrandColors.brandStrong),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: BrandColors.ink,
              ),
            ),
            if (message != null) ...<Widget>[
              const SizedBox(height: 8),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: BrandColors.muted, height: 1.45),
              ),
            ],
            if (actionLabel != null && onAction != null) ...<Widget>[
              const SizedBox(height: 18),
              FilledButton(onPressed: onAction, child: Text(actionLabel!)),
            ],
          ],
        ),
      ),
    );
  }
}

/// Inline banner used for honest notices (limits, partial states, guidance).
class InfoBanner extends StatelessWidget {
  const InfoBanner({
    super.key,
    required this.message,
    this.tone = InfoTone.info,
    this.icon,
  });

  final String message;
  final InfoTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    late final Color background;
    late final Color border;
    late final Color foreground;
    late final IconData defaultIcon;
    switch (tone) {
      case InfoTone.info:
        background = BrandColors.brandSoft;
        border = BrandColors.brandLine;
        foreground = BrandColors.brandStrong;
        defaultIcon = Icons.info_outline;
      case InfoTone.warning:
        background = BrandColors.warningBg;
        border = const Color(0xFFFDE68A);
        foreground = BrandColors.warning;
        defaultIcon = Icons.warning_amber_outlined;
      case InfoTone.danger:
        background = BrandColors.dangerBg;
        border = const Color(0xFFFECACA);
        foreground = BrandColors.danger;
        defaultIcon = Icons.error_outline;
      case InfoTone.success:
        background = BrandColors.successBg;
        border = const Color(0xFFBBF7D0);
        foreground = BrandColors.success;
        defaultIcon = Icons.check_circle_outline;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon ?? defaultIcon, size: 18, color: foreground),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: foreground, height: 1.4, fontSize: 13.5),
            ),
          ),
        ],
      ),
    );
  }
}

enum InfoTone { info, warning, danger, success }

/// Section heading used across the tabs.
class SectionHeader extends StatelessWidget {
  const SectionHeader({super.key, required this.title, this.action, this.onAction});

  final String title;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10, top: 4),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: BrandColors.ink,
              ),
            ),
          ),
          if (action != null && onAction != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                minimumSize: const Size(0, 32),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: Text(action!, style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}
