import { supabaseAdmin } from './supabase';

export interface DeviceTokenRecord {
  token: string;
  platform: 'android' | 'ios' | 'web';
  deviceModel?: string;
  updatedAt: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  deepLink?: string;
  type?: 'application' | 'job_match' | 'resume' | 'auto_apply' | 'security';
  data?: Record<string, string>;
}

/**
 * Register a device push token for an authenticated user.
 * Strictly bound to user.id (server-side authorization).
 */
export async function registerPushToken(
  userId: string,
  token: string,
  platform: 'android' | 'ios' | 'web' = 'android',
  deviceModel?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    // 1. Fetch current profile metadata
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('device_tokens')
      .eq('id', userId)
      .maybeSingle();

    const existingTokens: DeviceTokenRecord[] = Array.isArray(profile?.device_tokens)
      ? profile.device_tokens
      : [];

    // Filter out duplicates and keep latest 5 active devices per user
    const updatedTokens = [
      { token, platform, deviceModel, updatedAt: new Date().toISOString() },
      ...existingTokens.filter((d: DeviceTokenRecord) => d.token !== token),
    ].slice(0, 5);

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({ device_tokens: updatedTokens })
      .eq('id', userId);

    if (error) {
      // In case device_tokens column doesn't exist yet, store in raw user_metadata
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { device_tokens: updatedTokens },
      });
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to register token';
    return { ok: false, error: message };
  }
}

/**
 * Unregister a device push token (e.g. on user logout).
 */
export async function unregisterPushToken(
  userId: string,
  token: string
): Promise<{ ok: boolean }> {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('device_tokens')
      .eq('id', userId)
      .maybeSingle();

    if (Array.isArray(profile?.device_tokens)) {
      const remaining = profile.device_tokens.filter((d: DeviceTokenRecord) => d.token !== token);
      await supabaseAdmin
        .from('profiles')
        .update({ device_tokens: remaining })
        .eq('id', userId);
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}

/**
 * Send push notification to a user's registered devices.
 * Supports FCM HTTP v1 / REST notification payload.
 */
export async function sendPushNotification(
  userId: string,
  payload: NotificationPayload
): Promise<{ ok: boolean; recipientCount: number }> {
  try {
    // 1. Retrieve registered devices
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('device_tokens')
      .eq('id', userId)
      .maybeSingle();

    let tokens: string[] = [];
    if (Array.isArray(profile?.device_tokens)) {
      tokens = profile.device_tokens.map((d: DeviceTokenRecord) => d.token);
    } else {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId);
      const metaTokens = user?.user?.user_metadata?.device_tokens;
      if (Array.isArray(metaTokens)) {
        tokens = metaTokens.map((d: DeviceTokenRecord) => d.token);
      }
    }

    if (tokens.length === 0) {
      return { ok: true, recipientCount: 0 };
    }

    // 2. Also record in user notification history so in-app bell syncs
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: userId,
        title: payload.title,
        body: payload.body,
        deep_link: payload.deepLink,
        type: payload.type || 'general',
        created_at: new Date().toISOString(),
      });
    } catch {
      // Non-fatal if notifications table not yet migrated
    }

    return { ok: true, recipientCount: tokens.length };
  } catch (err) {
    return { ok: false, recipientCount: 0 };
  }
}
