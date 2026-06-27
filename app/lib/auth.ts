import crypto from 'crypto';
import { supabase } from './db';

/**
 * SHA-256 hash — identical to GAS Utilities.computeDigest so existing passwords work.
 */
export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password, 'utf8').digest('hex');
}

/**
 * Create a session row and return the sessionId UUID.
 */
export async function saveSession(user: {
  userId: number;
  username: string;
  role: string;
  children: unknown[];
}): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const { error } = await supabase.from('sessions').insert({
    session_id: sessionId,
    user_id: user.userId,
    role: user.role,
    user_name: user.username,
    children: user.children,
    expires_at: expiresAt.toISOString(),
  });

  if (error) throw new Error('Failed to create session: ' + error.message);
  return sessionId;
}

/**
 * Validate a session and return session data or null.
 */
export async function validateSession(
  sessionId: string,
  requiredRole?: string
): Promise<{ valid: boolean; userId?: number; role?: string; msg?: string }> {
  if (!sessionId) return { valid: false, msg: 'セッションIDがありません' };

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('session_id', sessionId)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) return { valid: false, msg: 'セッションが無効です' };

  if (requiredRole && data.role !== requiredRole) {
    return { valid: false, msg: '権限がありません' };
  }

  // Extend session expiry on each access (sliding session)
  const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await supabase
    .from('sessions')
    .update({ expires_at: newExpiry.toISOString() })
    .eq('session_id', sessionId);

  return { valid: true, userId: data.user_id, role: data.role };
}
