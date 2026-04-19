import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// In-app notification model.
class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final String? deeplink;
  final bool read;
  final DateTime createdAt;
  final Map<String, dynamic> metadata;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.read,
    required this.createdAt,
    this.deeplink,
    this.metadata = const {},
  });

  factory AppNotification.fromFirestore(DocumentSnapshot doc) {
    final d = doc.data() as Map<String, dynamic>;
    return AppNotification(
      id: doc.id,
      type: (d['type'] as String?) ?? 'info',
      title: (d['title'] as String?) ?? '',
      body: (d['body'] as String?) ?? '',
      deeplink: d['deeplink'] as String?,
      read: (d['read'] as bool?) ?? false,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      metadata: (d['metadata'] as Map<String, dynamic>?) ?? const {},
    );
  }
}

/// Reads and mutates the in-app notification inbox at
/// `notifications/{uid}/inbox/*`.
class NotificationService {
  static final _db = FirebaseFirestore.instance;

  static String? _uid() => FirebaseAuth.instance.currentUser?.uid;

  /// Stream of the current user's inbox, newest first.
  static Stream<List<AppNotification>> inboxStream() {
    final uid = _uid();
    if (uid == null) return Stream.value(const []);
    return _db
        .collection('notifications')
        .doc(uid)
        .collection('inbox')
        .orderBy('createdAt', descending: true)
        .limit(100)
        .snapshots()
        .map((snap) =>
            snap.docs.map(AppNotification.fromFirestore).toList());
  }

  /// Stream of unread count — used to badge the bell icon.
  static Stream<int> unreadCountStream() {
    final uid = _uid();
    if (uid == null) return Stream.value(0);
    return _db
        .collection('notifications')
        .doc(uid)
        .collection('inbox')
        .where('read', isEqualTo: false)
        .snapshots()
        .map((snap) => snap.size);
  }

  static Future<void> markAsRead(String notifId) async {
    final uid = _uid();
    if (uid == null) return;
    await _db
        .collection('notifications')
        .doc(uid)
        .collection('inbox')
        .doc(notifId)
        .update({'read': true});
  }

  static Future<void> markAllAsRead() async {
    final uid = _uid();
    if (uid == null) return;
    final unread = await _db
        .collection('notifications')
        .doc(uid)
        .collection('inbox')
        .where('read', isEqualTo: false)
        .get();
    final batch = _db.batch();
    for (final doc in unread.docs) {
      batch.update(doc.reference, {'read': true});
    }
    if (unread.docs.isNotEmpty) await batch.commit();
  }
}
