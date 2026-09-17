/// Small, dependency-free formatting helpers (the app deliberately avoids an
/// `intl` dependency: one less moving part in a build that must be reliable).
String relativeDate(DateTime? value) {
  if (value == null) return '';
  final now = DateTime.now();
  final diff = now.difference(value.toLocal());
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return shortDate(value);
}

String shortDate(DateTime? value) {
  if (value == null) return '';
  final local = value.toLocal();
  const months = <String>[
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return '${local.day} ${months[local.month - 1]} ${local.year}';
}

DateTime? parseDate(Object? value) {
  if (value is String && value.isNotEmpty) return DateTime.tryParse(value);
  return null;
}

String initialsOf(String? name, {String fallback = 'J'}) {
  final trimmed = (name ?? '').trim();
  if (trimmed.isEmpty) return fallback;
  final parts = trimmed.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return fallback;
  if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
  return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
}

String statusLabel(String status) {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'PREPARING':
      return 'Preparing';
    case 'AWAITING_APPROVAL':
      return 'Awaiting approval';
    case 'APPROVED':
      return 'Approved';
    case 'QUEUED':
      return 'Queued';
    case 'SUBMITTED':
      return 'Submitted';
    case 'INTERVIEW':
      return 'Interview';
    case 'REJECTED':
      return 'Rejected';
    case 'WITHDRAWN':
      return 'Withdrawn';
    default:
      return status;
  }
}
