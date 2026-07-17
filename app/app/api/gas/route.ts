import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';
import { hashPassword, saveSession, validateSession } from '@/lib/auth';
import webpush from 'web-push';

export const runtime = 'nodejs';

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:hiraolabs@gmail.com',
    pub,
    priv
  );
  vapidConfigured = true;
  return true;
}

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function normalize(name: string) {
  return String(name).replace(/\s+/g, '');
}

function formatDate(d: Date | string | null): string {
  if (!d) return '';
  const dt = d instanceof Date ? d : new Date(String(d).replace(/\//g, '-'));
  if (isNaN(dt.getTime())) return String(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

// 全購読者へWebプッシュ通知を送信。失効した購読は削除する。
async function sendPushToAll(title: string, body: string, url = '/main.html') {
  if (!ensureVapid()) return;
  const { data: subs } = await supabase.from('push_subscriptions').select('id, subscription');
  if (!subs || subs.length === 0) return;
  const payload = JSON.stringify({ title, body, url });
  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription as webpush.PushSubscription, payload);
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.id);
        }
      }
    })
  );
}

// 管理者のみへWebプッシュ通知を送信。
async function sendPushToAdmins(title: string, body: string, url = '/main.html') {
  if (!ensureVapid()) return;
  const { data: admins } = await supabase.from('users').select('user_id').eq('role', 'admin');
  const adminIds = (admins || []).map((a) => a.user_id);
  if (adminIds.length === 0) return;
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, subscription')
    .in('user_id', adminIds);
  if (!subs || subs.length === 0) return;
  const payload = JSON.stringify({ title, body, url });
  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription as webpush.PushSubscription, payload);
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', row.id);
        }
      }
    })
  );
}

async function savePushSubscription(sessionId: string, subscription: Record<string, unknown>) {
  const session = await validateSession(sessionId);
  if (!session.valid) return { success: false, msg: 'ログインし直してください' };
  const endpoint = subscription?.endpoint as string;
  if (!endpoint) return { success: false, msg: '購読情報が不正です' };
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: session.userId,
      endpoint,
      subscription,
      created_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

async function deletePushSubscription(endpoint: string) {
  if (!endpoint) return { success: false, msg: 'endpoint がありません' };
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  return { success: true };
}

// -------------------------------------------------------
// Route handler
// -------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const result = await dispatch(data);
    return json(result);
  } catch (err: unknown) {
    return json({ success: false, error: String(err) }, 500);
  }
}

// デモ環境: 読み取り系・ログイン以外の書き込みを一律ブロック（fail-closed）
const DEMO_MODE = process.env.DEMO_MODE === 'true';
function isDemoAllowed(action: string): boolean {
  if (action.startsWith('get')) return true;
  return ['login', 'validateSession', 'chatAI', 'appMeta'].includes(action);
}

async function dispatch(data: Record<string, unknown>): Promise<unknown> {
  const action = data.action as string;

  if (DEMO_MODE && !isDemoAllowed(action)) {
    return { success: false, demo: true, msg: 'これはデモ版です。データの追加・変更・削除はできません。' };
  }

  switch (action) {
    // ===== Meta =====
    case 'appMeta':
      return { success: true, demo: DEMO_MODE };

    // ===== Auth =====
    case 'login':
      return loginAPI(data.username as string, data.password as string);

    case 'regist':
      return registUserAPI(data as Record<string, unknown>);

    case 'validateSession':
      return validateSessionWithName(data.sessionId as string, data.requiredRole as string | undefined);

    case 'requestPasswordReset':
      return requestPasswordReset(data.username as string);

    case 'getPasswordResetRequests':
      return getPasswordResetRequests(data.sessionId as string);

    case 'resetMemberPassword':
      return resetMemberPassword(data.sessionId as string, Number(data.targetUserId), data.newPassword as string, data.requestId as number | undefined);

    case 'changePassword':
      return changePassword(data.sessionId as string, data.currentPassword as string, data.newPassword as string);

    case 'impersonateUser':
      return impersonateUser(data.sessionId as string, Number(data.targetUserId));

    case 'endImpersonation':
      return endImpersonation(data.sessionId as string);

    case 'getVapidPublicKey':
      return { success: true, publicKey: process.env.VAPID_PUBLIC_KEY || '' };

    case 'savePushSubscription':
      return savePushSubscription(data.sessionId as string, data.subscription as Record<string, unknown>);

    case 'deletePushSubscription':
      return deletePushSubscription(data.endpoint as string);

    // ===== Events =====
    case 'getEventsWithStats':
      return { success: true, events: await getEventsWithStats(data.userId as string) };

    case 'getPracticeWithStats':
      return { success: true, practices: await getPracticeWithStats(data.userId as string) };

    case 'getEventDetailWithUserData':
      return getEventDetailWithUserData(data.eventId as string, data.userId as string);

    case 'updateEventResponse':
      return updateEventResponse(
        data.eventId as string,
        data.userId as string,
        (data.status || data.answer) as string
      );

    case 'updatePracticeResponse':
      return updatePracticeResponse(
        data.practiceId as string,
        data.userId as string,
        (data.status || data.answer) as string
      );

    case 'setPracticeStatusForMember':
      return setPracticeStatusForMember(
        data.sessionId as string,
        data.practiceId as string,
        data.targetUserId as string,
        data.status as string
      );

    // ===== AI chat =====
    case 'chatAI':
      return chatAILocal(data.text as string || data.message as string);

    // ===== Members =====
    case 'getMembers':
      return getMembers((data.role as string) || 'user');

    case 'approveMember':
      return approveMember(data.userId as string);

    case 'deleteMember':
      return deleteMember(data.userId as string);

    case 'deleteChild':
      return deleteChild(data.childId as string, data.userId as string);

    case 'addChild':
      return addChild(data.userId as string, data.childName as string, data.birthday as string);

    case 'approveChild':
      return approveChild(data.childId as string);

    case 'updateMemberInfo':
      return updateMemberInfo(
        data.targetUserId as string,
        data.data as Record<string, unknown>,
        data.userId as string
      );

    // ===== Events/Practices admin =====
    case 'saveEvent': {
      const result = await saveEvent(data.event as Record<string, unknown>);
      if (result.success && !(data.event as Record<string,unknown>).eventId) {
        const ev = data.event as Record<string, unknown>;
        const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
        const d = new Date(String(ev.date).replace(/\//g, '-'));
        const dateStr = `${ev.date}（${weekdays[d.getDay()]}）`;
        const typeLabel = ev.type === 'festival' ? '🎉' : '📢';
        const timeStr = ev.time && ev.time !== '未定' ? ' ' + ev.time : ev.time === '未定' ? '（時間未定）' : '';
        const title = `${typeLabel} 新しいイベント：${ev.title}`;
        const body = `📅 ${dateStr}${timeStr}${ev.deadline ? `\n回答期限：${ev.deadline}` : ''}\nアプリから参加・不参加を回答してください。`;
        await sendPushToAll(title, body);
      }
      return result;
    }

    case 'savePractice':
      return savePractice(data.practice as Record<string, unknown>);

    case 'deletePractice':
      return deletePractice(data.sessionId as string, data.practiceId as string);

    case 'addPerformance':
      return addPerformance(data.performance as Record<string, unknown>);

    case 'getPerformanceRoles':
      return getPerformanceRoles();

    // ===== Otabi places =====
    case 'getOtabiPlaces':
      return getOtabiPlaces();

    case 'saveOtabiPlace':
      return saveOtabiPlace(data.place as Record<string, unknown>);

    case 'deleteOtabiPlace':
      return deleteOtabiPlace(data.placeId as string);

    case 'getOtabiSchedule':
      return getOtabiSchedule(data.year as string, data.group as string, data.day as string);

    case 'saveOtabiEntry':
      return saveOtabiEntry(data.entry as Record<string, unknown>);

    case 'deleteOtabiEntry':
      return deleteOtabiEntry(data.entryId as string);

    case 'copyOtabiSchedule':
      return copyOtabiSchedule(data.fromYear as string, data.toYear as string, data.group as string, data.day as string);

    case 'getOtabiDonations':
      return getOtabiDonations(data.year as string);

    case 'saveOtabiDonations':
      return saveOtabiDonations(data.donations as Array<Record<string, unknown>>);

    case 'addOtabiExtraDonation':
      return addOtabiExtraDonation(data.year as string, data.group as string, data.day as string, data.place_name as string, Number(data.donation) || 0);

    case 'updateOtabiExtraDonation':
      return updateOtabiExtraDonation(Number(data.id), Number(data.donation) || 0);

    case 'deleteOtabiExtraDonation':
      return deleteOtabiExtraDonation(Number(data.id));

    case 'reorderOtabiEntries':
      return reorderOtabiEntries(data.updates as Array<Record<string, unknown>>);

    case 'markOtabiComplete':
      return markOtabiComplete(data.entryId as string, data.actualTime as string);

    case 'getOtabiAllProgress':
      return getOtabiAllProgress(data.year as string, data.day as string);

    // ===== Shishimaru =====
    case 'getParticipationStats':
      return getParticipationStats((data.filter as string) || 'event');

    case 'getMemos':
      return getMemos();

    case 'saveMemo':
      return saveMemo(data.text as string, data.userId as string);

    case 'deleteMemo':
      return deleteMemo(data.memoId as string, data.userId as string);

    // ===== Gear =====
    case 'getGear':
      return getGear();

    case 'saveGear':
      return saveGear(data.targetUserId as string, data.gear as Record<string, unknown>, data.userId as string);

    case 'getGearSpare':
      return getGearSpare();

    case 'upsertGearSpare':
      return upsertGearSpare(data.item_type as string, data.value as string, Number(data.quantity), data.userId as string);

    case 'saveChildGear':
      return saveChildGear(data.childId as string, data.gear as Record<string, unknown>, data.userId as string);

    case 'getMyPage':
      return getMyPage(data.userId as string);

    case 'saveGameScore':
      return saveGameScore(data.userId as string, Number(data.score));

    case 'getGameRanking':
      return getGameRanking();

    case 'getSetting':
      return getSetting(data.key as string);

    case 'saveSetting':
      return saveSetting(data.key as string, data.value as string, data.userId as string);

    default:
      return { success: false, msg: 'unknown action' };
  }
}

// -------------------------------------------------------
// Game scores
// Table: game_scores (user_id TEXT UNIQUE, user_name TEXT, score INT, created_at TIMESTAMP)
// -------------------------------------------------------

const SYSTEM_ADMIN_NAME = '平尾大雅';

async function validateSessionWithName(sessionId: string, requiredRole?: string) {
  const session = await validateSession(sessionId, requiredRole);
  if (!session.valid) return { ...session, demo: DEMO_MODE };
  const { data: userRow } = await supabase.from('users').select('stored_name').eq('user_id', session.userId).single();
  const name = (userRow?.stored_name as string) || '';
  const { data: sessionRow } = await supabase.from('sessions').select('impersonated_by').eq('session_id', sessionId).single();
  return {
    ...session,
    name,
    demo: DEMO_MODE,
    isSystemAdmin: normalize(name) === normalize(SYSTEM_ADMIN_NAME),
    impersonating: !!sessionRow?.impersonated_by,
  };
}

// システム管理者(平尾大雅)が任意アカウントへログイン中セッションを作成
async function impersonateUser(sessionId: string, targetUserId: number) {
  const session = await validateSession(sessionId);
  if (!session.valid) return { success: false, msg: 'ログインし直してください' };

  const { data: me } = await supabase.from('users').select('stored_name').eq('user_id', session.userId).single();
  if (normalize((me?.stored_name as string) || '') !== normalize(SYSTEM_ADMIN_NAME)) {
    return { success: false, msg: '権限がありません' };
  }

  const { data: target } = await supabase.from('users').select('*').eq('user_id', targetUserId).single();
  if (!target || target.status === 'deleted') return { success: false, msg: '対象のユーザーが見つかりません' };

  const { data: children } = await supabase.from('children').select('*').eq('user_id', targetUserId);
  const childList = (children || []).map((c) => ({
    childId: c.child_id,
    childName: c.child_name,
    role: c.role,
    status: c.status,
  }));

  const newSessionId = await saveSession({
    userId: target.user_id,
    username: target.stored_name,
    role: target.role,
    children: childList,
    impersonatedBy: sessionId,
  });

  return { success: true, sessionId: newSessionId, userName: target.stored_name };
}

// なりすましを終了し、元のシステム管理者セッションへ戻る
async function endImpersonation(sessionId: string) {
  const { data: sessionRow } = await supabase.from('sessions').select('impersonated_by').eq('session_id', sessionId).single();
  const originalSessionId = sessionRow?.impersonated_by as string | undefined;
  if (!originalSessionId) return { success: false, msg: 'なりすましセッションではありません' };

  const original = await validateSession(originalSessionId);
  if (!original.valid) return { success: false, msg: '元のセッションが無効です。再ログインしてください。' };

  await supabase.from('sessions').delete().eq('session_id', sessionId);
  return { success: true, sessionId: originalSessionId };
}

async function saveGameScore(userId: string, score: number) {
  const session = await validateSession(userId);
  if (!session.valid) return { success: false, msg: '未認証' };
  const { data: userRow } = await supabase.from('users').select('stored_name').eq('user_id', session.userId).single();
  const userName = (userRow?.stored_name as string) || 'Unknown';
  const { data: existing } = await supabase.from('game_scores').select('score').eq('user_id', userId).single();
  const isHighScore = !existing || score > (existing.score as number);
  if (isHighScore) {
    await supabase.from('game_scores').upsert({ user_id: userId, user_name: userName, score }, { onConflict: 'user_id' });
  }
  return { success: true, isHighScore };
}

async function getGameRanking() {
  const { data } = await supabase.from('game_scores').select('user_id, user_name, score').order('score', { ascending: false }).limit(20);
  return { success: true, ranking: data || [] };
}

async function getSetting(key: string) {
  const { data } = await supabase.from('settings').select('value').eq('key', key).single();
  return { success: true, value: data?.value ?? null };
}

async function saveSetting(key: string, value: string, userId: string) {
  const session = await validateSession(userId);
  if (!session.valid || session.role !== 'admin') return { success: false, msg: '権限がありません' };
  const { data: existing } = await supabase.from('settings').select('id').eq('key', key).single();
  if (existing) {
    await supabase.from('settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
  } else {
    await supabase.from('settings').insert({ key, value });
  }
  return { success: true };
}

// -------------------------------------------------------
// Auth
// -------------------------------------------------------

async function loginAPI(username: string, password: string) {
  const hashedInput = hashPassword(password);

  const { data: users, error } = await supabase
    .from('users')
    .select('*');

  if (error) return { success: false, msg: 'DB error' };

  const { data: children } = await supabase.from('children').select('*');

  for (const row of users || []) {
    if (normalize(row.stored_name) === normalize(username) && row.stored_hash === hashedInput) {
      if (row.status === 'hold') return { success: false, msg: '承認待ちです' };
      if (row.status === 'deleted') continue;

      const childList = (children || [])
        .filter((c) => c.user_id === row.user_id)
        .map((c) => ({
          childId: c.child_id,
          childName: c.child_name,
          role: c.role,
          status: c.status,
        }));

      const user = {
        userId: row.user_id,
        username: row.stored_name,
        role: row.role,
        phone: row.phone || '',
        prefecture: row.prefecture || '',
        city: row.city || '',
        addressDetail: row.address_detail || '',
        birthday: row.birthday || '',
        children: childList,
      };

      const sessionId = await saveSession(user);
      return { success: true, sessionId, user };
    }
  }

  return { success: false, msg: 'ユーザー名またはパスワードが違います' };
}

// -------------------------------------------------------
// Password reset
// -------------------------------------------------------

async function requestPasswordReset(username: string) {
  const name = String(username || '').trim();
  if (!name) return { success: false, msg: 'ユーザー名を入力してください' };

  const { data: users } = await supabase.from('users').select('*');
  const row = (users || []).find(
    (u) => normalize(u.stored_name) === normalize(name) && u.status !== 'deleted'
  );
  if (!row) return { success: false, msg: 'そのユーザー名は登録されていません' };

  // 既に未処理の申請があれば重複作成しない
  const { data: existing } = await supabase
    .from('password_reset_requests')
    .select('id')
    .eq('user_id', row.user_id)
    .eq('status', 'pending');

  if (!existing || existing.length === 0) {
    const now = new Date().toISOString();
    await supabase.from('password_reset_requests').insert({
      user_id: row.user_id,
      user_name: row.stored_name,
      status: 'pending',
      created_at: now,
      updated_at: now,
    });
  }

  // 管理者のみにプッシュ通知（全員グループには流さない）
  await sendPushToAdmins(
    '🔑 パスワード再発行申請',
    `${row.stored_name} さんからパスワード再発行の申請がありました。`
  );

  return { success: true };
}

async function getPasswordResetRequests(sessionId: string) {
  const session = await validateSession(sessionId);
  if (!session.valid || session.role !== 'admin') return { success: false, msg: '権限がありません' };
  const { data } = await supabase
    .from('password_reset_requests')
    .select('id, user_id, user_name, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  return { success: true, requests: data || [] };
}

async function resetMemberPassword(sessionId: string, targetUserId: number, newPassword: string, requestId?: number) {
  const session = await validateSession(sessionId);
  if (!session.valid || session.role !== 'admin') return { success: false, msg: '権限がありません' };
  const pw = String(newPassword || '').trim();
  if (pw.length < 4) return { success: false, msg: 'パスワードは4文字以上にしてください' };

  const { error } = await supabase
    .from('users')
    .update({ stored_hash: hashPassword(pw), updated_at: new Date().toISOString() })
    .eq('user_id', targetUserId);
  if (error) return { success: false, msg: error.message };

  // 申請を処理済みに
  if (requestId) {
    await supabase.from('password_reset_requests').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', requestId);
  } else {
    await supabase.from('password_reset_requests').update({ status: 'done', updated_at: new Date().toISOString() }).eq('user_id', targetUserId).eq('status', 'pending');
  }

  return { success: true };
}

async function changePassword(sessionId: string, currentPassword: string, newPassword: string) {
  const session = await validateSession(sessionId);
  if (!session.valid) return { success: false, msg: 'ログインし直してください' };

  const cur = String(currentPassword || '');
  const next = String(newPassword || '').trim();
  if (next.length < 4) return { success: false, msg: '新しいパスワードは4文字以上にしてください' };

  const { data: row } = await supabase
    .from('users')
    .select('user_id, stored_hash')
    .eq('user_id', session.userId)
    .single();
  if (!row) return { success: false, msg: 'ユーザーが見つかりません' };

  if (row.stored_hash !== hashPassword(cur)) {
    return { success: false, msg: '現在のパスワードが違います' };
  }

  const { error } = await supabase
    .from('users')
    .update({ stored_hash: hashPassword(next), updated_at: new Date().toISOString() })
    .eq('user_id', session.userId);
  if (error) return { success: false, msg: error.message };

  return { success: true };
}

async function registUserAPI(form: Record<string, unknown>) {
  const fullName = `${String(form.lastName || '').trim()} ${String(form.firstName || '').trim()}`;

  // duplicate check
  const { data: existing } = await supabase
    .from('users')
    .select('user_id')
    .eq('stored_name', fullName)
    .neq('status', 'deleted');

  if (existing && existing.length > 0) {
    return { success: false, msg: 'この氏名は既に登録されています。' };
  }

  // get next userId
  const { data: last } = await supabase
    .from('users')
    .select('user_id')
    .order('user_id', { ascending: false })
    .limit(1);

  const newUserId = last && last.length > 0 ? last[0].user_id + 1 : 1;
  const hashed = hashPassword(form.password as string);
  const now = new Date().toISOString();

  const { error } = await supabase.from('users').insert({
    user_id: newUserId,
    stored_name: fullName,
    stored_hash: hashed,
    role: 'user',
    status: 'hold',
    position: form.position || '',
    phone: form.phone || '',
    prefecture: form.prefecture || '',
    city: form.city || '',
    address_detail: form.addressDetail || '',
    birthday: form.birthDate || null,
    sns_consent: form.snsConsent ? 'yes' : 'no',
    created_at: now,
    updated_at: now,
  });

  if (error) return { success: false, msg: error.message };

  // children
  if (Array.isArray(form.children)) {
    const { data: lastChild } = await supabase
      .from('children')
      .select('child_id')
      .order('child_id', { ascending: false })
      .limit(1);

    let lastChildId = lastChild && lastChild.length > 0 ? lastChild[0].child_id : 0;

    for (const c of form.children as Array<Record<string, unknown>>) {
      const first = String(c.firstName || '').trim();
      if (!first) continue;
      lastChildId++;
      await supabase.from('children').insert({
        child_id: lastChildId,
        user_id: newUserId,
        child_name: first,
        birthday: c.birthday || null,
        role: 'child',
        status: 'hold',
        created_at: now,
        updated_at: now,
      });
    }
  }

  return { success: true };
}

// -------------------------------------------------------
// Events
// -------------------------------------------------------

async function getEventsWithStats(userId: string) {
  const uid = Number(userId);

  const [eventsRes, answersRes, usersRes, perfsRes] = await Promise.all([
    supabase.from('events').select('*').order('date', { ascending: true }),
    supabase.from('answers_events').select('*'),
    supabase.from('users').select('user_id,stored_name,status,created_at'),
    supabase.from('performances').select('*'),
  ]);

  const events = eventsRes.data || [];
  const answers = answersRes.data || [];
  const users = usersRes.data || [];
  const perfs = perfsRes.data || [];

  const perfsByEvent: Record<number, Array<Record<string, unknown>>> = {};
  perfs.forEach((p) => {
    if (!perfsByEvent[p.event_id]) perfsByEvent[p.event_id] = [];
    perfsByEvent[p.event_id].push(mapPerformanceRow(p));
  });

  const activeUsers = users.filter((u) => u.status === 'active').map((u) => ({
    id: u.user_id,
    name: u.stored_name,
    createdAt: u.created_at ? new Date(u.created_at) : null,
  }));

  const answersMap: Record<number, Array<{ userId: number; status: string }>> = {};
  for (const a of answers) {
    if (!answersMap[a.event_id]) answersMap[a.event_id] = [];
    answersMap[a.event_id].push({ userId: a.user_id, status: a.status });
  }

  return events.map((ev) => {
    const evDate = new Date(ev.date);
    const eligibleUsers = activeUsers.filter((u) => !u.createdAt || u.createdAt <= evDate);

    const answerMap: Record<number, string> = {};
    (answersMap[ev.event_id] || []).forEach((a) => (answerMap[a.userId] = a.status));

    const yesNames: string[] = [];
    const noNames: string[] = [];
    let yes = 0, no = 0, na = 0;
    let myStatus = '未回答';

    eligibleUsers.forEach((u) => {
      const s = answerMap[u.id];
      if (!s) { na++; }
      else if (s === '参加') { yes++; yesNames.push(u.name); }
      else if (s === '不参加') { no++; noNames.push(u.name); }
      else { na++; }
      if (u.id === uid && s) myStatus = s;
    });

    const answered = new Set([...yesNames, ...noNames]);
    const naNames = eligibleUsers.filter((u) => !answered.has(u.name)).map((u) => u.name);

    return {
      eventId: ev.event_id,
      date: formatDate(ev.date),
      title: ev.title,
      type: ev.type,
      time: ev.time || '',
      location: ev.location,
      comment: ev.comment,
      deadline: ev.deadline,
      yes, no, na,
      myStatus,
      members: { yes: yesNames, no: noNames, na: naNames },
      performances: perfsByEvent[ev.event_id] || [],
      sortKey: evDate.getTime(),
    };
  });
}

// DBの performances 行 → フロントエンドが期待する形へ変換
function mapPerformanceRow(p: Record<string, unknown>) {
  let roles = p.roles;
  if (typeof roles === 'string') {
    try { roles = JSON.parse(roles); } catch { roles = []; }
  }
  return {
    no: p.order || '',
    timeFrom: p.time_from || '',
    timeTo: p.time_to || '',
    name: p.name || '',
    taikoDai: p.taiko_dai || '',
    taikoKo: p.taiko_ko || '',
    roles: Array.isArray(roles) ? roles : [],
  };
}

async function getPracticeWithStats(userId: string) {
  const uid = Number(userId);

  const [practicesRes, answersRes, usersRes] = await Promise.all([
    supabase.from('practices').select('*').order('date', { ascending: true }),
    supabase.from('answers_practices').select('*'),
    supabase.from('users').select('user_id,stored_name,status'),
  ]);

  const practices = practicesRes.data || [];
  const answers = answersRes.data || [];
  const users = usersRes.data || [];

  const activeUsers = users.filter((u) => u.status === 'active').map((u) => ({
    id: u.user_id,
    name: u.stored_name,
  }));

  const answersMap: Record<number, Array<{ userId: number; status: string }>> = {};
  for (const a of answers) {
    if (!answersMap[a.practice_id]) answersMap[a.practice_id] = [];
    answersMap[a.practice_id].push({ userId: a.user_id, status: a.status });
  }

  return practices.map((pr) => {
    const answerMap: Record<number, string> = {};
    (answersMap[pr.practice_id] || []).forEach((a) => (answerMap[a.userId] = a.status));

    const absent: string[] = [];
    const late: string[] = [];
    const attend: string[] = [];
    const attendMembers: Array<{ userId: number; name: string }> = [];
    let myStatus = '';

    activeUsers.forEach((u) => {
      const s = answerMap[u.id];
      if (s === '欠席') absent.push(u.name);
      else if (s === '遅刻') late.push(u.name);
      else { attend.push(u.name); attendMembers.push({ userId: u.id, name: u.name }); } // 欠席・遅刻以外は出席とみなす（未回答含む）
      if (u.id === uid && s) myStatus = s;
    });

    return {
      practiceId: pr.practice_id,
      date: formatDate(pr.date),
      title: pr.title,
      type: pr.type,
      start: pr.start || '',
      end: pr.end || '',
      location: pr.location,
      comment: pr.comment,
      absent, late, attend, attendMembers, myStatus,
      sortKey: new Date(pr.date).getTime(),
    };
  });
}

async function getEventDetailWithUserData(eventId: string, userId: string) {
  const uid = Number(userId);

  const { data: ev } = await supabase.from('events').select('*').eq('event_id', Number(eventId)).single();
  if (!ev) return { success: false, msg: 'event not found' };

  const { data: answers } = await supabase.from('answers_events').select('*').eq('event_id', Number(eventId));
  const { data: users } = await supabase.from('users').select('user_id,stored_name,status').eq('status', 'active');
  const { data: perfs } = await supabase.from('performances').select('*').eq('event_id', Number(eventId));

  const answerMap: Record<number, string> = {};
  (answers || []).forEach((a) => (answerMap[a.user_id] = a.status));

  const members = (users || []).map((u) => ({
    userId: u.user_id,
    name: u.stored_name,
    status: answerMap[u.user_id] || '',
  }));

  const myAnswer = answerMap[uid] || '';

  return {
    success: true,
    event: { ...ev, eventId: ev.event_id, date: formatDate(ev.date) },
    members,
    myAnswer,
    performances: (perfs || []).map(mapPerformanceRow),
  };
}

async function updateEventResponse(eventId: string, userId: string, status: string) {
  const eid = Number(eventId);
  const uid = Number(userId);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('answers_events')
    .select('id')
    .eq('event_id', eid)
    .eq('user_id', uid)
    .single();

  if (existing) {
    await supabase.from('answers_events').update({ status, updated_at: now }).eq('id', existing.id);
  } else {
    await supabase.from('answers_events').insert({ event_id: eid, user_id: uid, status, created_at: now, updated_at: now });
  }

  const { data: allAnswers } = await supabase.from('answers_events').select('user_id,status').eq('event_id', eid);
  const { data: activeUsers } = await supabase.from('users').select('user_id,stored_name').eq('status', 'active');

  const answerMap: Record<number, string> = {};
  (allAnswers || []).forEach((a) => (answerMap[a.user_id] = a.status));

  const yes: string[] = [], no: string[] = [], na: string[] = [];
  (activeUsers || []).forEach((u) => {
    const s = answerMap[u.user_id];
    if (s === '参加') yes.push(u.stored_name);
    else if (s === '不参加') no.push(u.stored_name);
    else na.push(u.stored_name);
  });

  return { success: true, yes, no, na };
}

async function updatePracticeResponse(practiceId: string, userId: string, status: string) {
  const pid = Number(practiceId);
  const uid = Number(userId);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from('answers_practices')
    .select('id')
    .eq('practice_id', pid)
    .eq('user_id', uid)
    .single();

  if (existing) {
    if (!status) {
      await supabase.from('answers_practices').delete().eq('id', existing.id);
    } else {
      await supabase.from('answers_practices').update({ status, updated_at: now }).eq('id', existing.id);
    }
  } else if (status) {
    await supabase.from('answers_practices').insert({ practice_id: pid, user_id: uid, status, created_at: now, updated_at: now });
  }

  const { data: allAnswers } = await supabase.from('answers_practices').select('user_id,status').eq('practice_id', pid);
  const { data: activeUsers } = await supabase.from('users').select('user_id,stored_name').eq('status', 'active');

  const answerMap: Record<number, string> = {};
  (allAnswers || []).forEach((a) => (answerMap[a.user_id] = a.status));

  const absent: string[] = [], late: string[] = [];
  (activeUsers || []).forEach((u) => {
    const s = answerMap[u.user_id];
    if (s === '欠席') absent.push(u.stored_name);
    else if (s === '遅刻') late.push(u.stored_name);
  });

  return { success: true, absent, late };
}

// 管理者が他メンバーの練習出欠を変更する
async function setPracticeStatusForMember(sessionId: string, practiceId: string, targetUserId: string, status: string) {
  const session = await validateSession(sessionId);
  if (!session.valid || session.role !== 'admin') return { success: false, msg: '権限がありません' };
  return updatePracticeResponse(practiceId, targetUserId, status);
}

// -------------------------------------------------------
// AI chat (local — no LLM call)
// -------------------------------------------------------

async function chatAILocal(userMessage: string) {
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/');
  const msg = (userMessage || '').toLowerCase();

  if (msg.includes('今日') && msg.includes('日')) {
    return { success: true, reply: `今日は ${today} じゃよ。` };
  }
  if (msg.includes('次') && msg.includes('イベント')) {
    const { data: events } = await supabase.from('events').select('date,title').gte('date', new Date().toISOString()).order('date').limit(1);
    const e = events && events[0];
    if (e) return { success: true, reply: `次のイベントは ${formatDate(e.date)} に「${e.title}」があるぞ。` };
    return { success: true, reply: '今のところ予定はないのう。' };
  }
  if (msg.includes('天狗')) return { success: true, reply: '天狗は足が速くてかっこいいんじゃ！' };
  if (msg.includes('ひょっとこ')) return { success: true, reply: 'ひょっとこは愛嫉たっぷりで人気じゃのう！' };
  if (msg.includes('こんにちは') || msg.includes('やあ')) return { success: true, reply: 'おう、こんにちは！ししまるじゃ。' };

  return { success: true, reply: 'すまんのう、うまく答えられん質問じゃった…' };
}

// -------------------------------------------------------
// Members
// -------------------------------------------------------

async function getMembers(currentUserRole: string) {
  const { data: users } = await supabase
    .from('users')
    .select('user_id,stored_name,role,status,position')
    .in('status', ['active', 'hold']);

  const { data: children } = await supabase.from('children').select('child_id,user_id,child_name,status').neq('status', 'deleted');

  const raw = (users || []).map((u) => ({
    userId: u.user_id,
    name: u.stored_name,
    role: u.role,
    status: u.status,
    position: u.position || '',
    children: (children || [])
      .filter((c) => c.user_id === u.user_id)
      .map((c) => ({
        childId: c.child_id,
        childName: c.child_name,
        status: u.status === 'hold' ? 'hold' : c.status,
      })),
  }));

  if (currentUserRole === 'admin') {
    const hold = raw.filter((m) => m.status === 'hold');
    const active = raw.filter((m) => m.status === 'active');
    return { success: true, members: [...hold, ...active] };
  }

  return {
    success: true,
    members: raw.filter((m) => m.name).map((m) => ({
      userId: m.userId,
      name: m.name,
      status: m.status,
      position: m.position,
      children: m.children.map((k) => ({ childName: k.childName })),
    })),
  };
}

async function approveMember(userId: string) {
  const uid = Number(userId);
  await supabase.from('users').update({ status: 'active' }).eq('user_id', uid);
  await supabase.from('children').update({ status: 'active' }).eq('user_id', uid);
  return { success: true };
}

async function deleteMember(userId: string) {
  const uid = Number(userId);
  await supabase.from('children').update({ status: 'deleted' }).eq('user_id', uid);
  await supabase.from('users').update({ status: 'deleted' }).eq('user_id', uid);
  return { success: true };
}

async function deleteChild(childId: string, requestUserId: string) {
  const { data: reqUser } = await supabase.from('users').select('role').eq('user_id', Number(requestUserId)).single();
  if (!reqUser || reqUser.role !== 'admin') return { success: false, msg: '権限がありません' };

  await supabase.from('children').update({ status: 'deleted' }).eq('child_id', Number(childId));
  await supabase.from('child_gear').delete().eq('child_id', Number(childId));
  return { success: true };
}

async function approveChild(childId: string) {
  const { error } = await supabase.from('children').update({ status: 'active', updated_at: new Date().toISOString() }).eq('child_id', Number(childId));
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

async function addChild(userId: string, childName: string, birthday: string) {
  if (!childName?.trim()) return { success: false, msg: '名前を入力してください' };
  const now = new Date().toISOString();
  const { error } = await supabase.from('children').insert({
    user_id: Number(userId),
    child_name: childName.trim(),
    birthday: birthday || null,
    role: 'child',
    status: 'hold',
    created_at: now,
    updated_at: now,
  });
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

async function updateMemberInfo(targetUserId: string, data: Record<string, unknown>, requestUserId: string) {
  const { data: reqUser } = await supabase.from('users').select('role').eq('user_id', Number(requestUserId)).single();
  if (!reqUser || reqUser.role !== 'admin') return { success: false, msg: '権限がありません' };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const fieldMap: Record<string, string> = {
    storedName: 'stored_name',
    phone: 'phone',
    prefecture: 'prefecture',
    city: 'city',
    addressDetail: 'address_detail',
    birthday: 'birthday',
    position: 'position',
  };
  for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
    if (data[jsKey] !== undefined) update[dbKey] = data[jsKey];
  }

  const { error } = await supabase.from('users').update(update).eq('user_id', Number(targetUserId));
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

// -------------------------------------------------------
// Events / Practices admin
// -------------------------------------------------------

async function saveEvent(event: Record<string, unknown>) {
  const now = new Date().toISOString();

  if (event.eventId) {
    const { error } = await supabase
      .from('events')
      .update({
        date: event.date,
        title: event.title,
        type: event.type,
        time: event.time || '',
        location: event.location,
        comment: event.comment,
        deadline: event.deadline || null,
        updated_at: now,
      })
      .eq('event_id', Number(event.eventId));
    if (error) return { success: false, message: error.message };
    await replaceEventPerformances(Number(event.eventId), event.performances);
    return { success: true, eventId: event.eventId, updated: true };
  }

  const { data: last } = await supabase.from('events').select('event_id').order('event_id', { ascending: false }).limit(1);
  const newId = last && last.length > 0 ? last[0].event_id + 1 : 1;

  const { error } = await supabase.from('events').insert({
    event_id: newId,
    date: event.date,
    title: event.title,
    type: event.type,
    time: event.time || '',
    location: event.location,
    comment: event.comment,
    deadline: event.deadline || null,
    created_at: now,
    updated_at: now,
  });
  if (error) return { success: false, message: error.message };
  await replaceEventPerformances(newId, event.performances);
  return { success: true, eventId: newId, created: true };
}

// イベントの演目を全入れ替え（フォームで集めた内容をそのまま反映）
async function replaceEventPerformances(eventId: number, performances: unknown) {
  await supabase.from('performances').delete().eq('event_id', eventId);
  if (!Array.isArray(performances) || performances.length === 0) return;

  const now = new Date().toISOString();
  const { data: last } = await supabase.from('performances').select('performance_id').order('performance_id', { ascending: false }).limit(1);
  let nextId = last && last.length > 0 ? last[0].performance_id + 1 : 1;

  const rows = (performances as Array<Record<string, unknown>>).map((p) => ({
    performance_id: nextId++,
    event_id: eventId,
    name: p.name || '',
    order: p.no || '',
    time_from: p.timeFrom || '',
    time_to: p.timeTo || '',
    taiko_dai: p.taikoDai || '',
    taiko_ko: p.taikoKo || '',
    roles: JSON.stringify(p.roles || []),
    created_at: now,
    updated_at: now,
  }));
  await supabase.from('performances').insert(rows);
}

async function savePractice(practice: Record<string, unknown>) {
  const now = new Date().toISOString();

  const { data: dup } = await supabase
    .from('practices')
    .select('practice_id')
    .eq('date', practice.date)
    .limit(1);
  if (dup && dup.length > 0) {
    return { success: false, message: `${practice.date} にはすでに練習日が登録されています` };
  }

  const { data: last } = await supabase.from('practices').select('practice_id').order('practice_id', { ascending: false }).limit(1);
  const newId = last && last.length > 0 ? last[0].practice_id + 1 : 1;

  const { error } = await supabase.from('practices').insert({
    practice_id: newId,
    date: practice.date,
    title: practice.title || '練習',
    type: practice.type || '',
    start: practice.start || '',
    end: practice.end || '',
    location: practice.location || '',
    comment: practice.comment || '',
    created_at: now,
    updated_at: now,
  });
  if (error) return { success: false, message: error.message };
  return { success: true, practiceId: newId, created: true };
}

async function deletePractice(sessionId: string, practiceId: string) {
  const session = await validateSession(sessionId);
  if (!session.valid || session.role !== 'admin') return { success: false, msg: '権限がありません' };
  const pid = Number(practiceId);
  await supabase.from('answers_practices').delete().eq('practice_id', pid);
  const { error } = await supabase.from('practices').delete().eq('practice_id', pid);
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

async function addPerformance(performance: Record<string, unknown>) {
  const { data: last } = await supabase.from('performances').select('performance_id').order('performance_id', { ascending: false }).limit(1);
  const newId = last && last.length > 0 ? last[0].performance_id + 1 : 1;
  const now = new Date().toISOString();

  const { error } = await supabase.from('performances').insert({
    performance_id: newId,
    event_id: performance.eventId,
    name: performance.name || '',
    order: performance.order || '',
    roles: JSON.stringify(performance.roles || {}),
    created_at: now,
    updated_at: now,
  });
  if (error) return { success: false, message: error.message };
  return { success: true, performanceId: newId };
}

async function getPerformanceRoles() {
  const { data, error } = await supabase.from('performance_roles').select('role_name');
  if (error) return { success: false, message: error.message };
  const roles: Record<string, string> = {};
  (data || []).forEach((r) => { if (r.role_name) roles[r.role_name] = ''; });
  return { success: true, roles };
}

// -------------------------------------------------------
// Otabi places
// -------------------------------------------------------

async function getOtabiPlaces() {
  const { data, error } = await supabase.from('otabi_places').select('*').order('place_id');
  if (error) return { success: false, msg: error.message };
  return { success: true, places: data || [] };
}

async function saveOtabiPlace(place: Record<string, unknown>) {
  const now = new Date().toISOString();

  if (place.place_id) {
    const { error } = await supabase
      .from('otabi_places')
      .update({ name: place.name || '', address: place.address || '', tel: place.tel || '', group: place.group || '' })
      .eq('place_id', Number(place.place_id));
    if (error) return { success: false, msg: error.message };
    return { success: true, place_id: place.place_id };
  }

  const { data: last } = await supabase.from('otabi_places').select('place_id').order('place_id', { ascending: false }).limit(1);
  const newId = last && last.length > 0 ? last[0].place_id + 1 : 1;

  const { error } = await supabase.from('otabi_places').insert({
    place_id: newId,
    name: place.name || '',
    address: place.address || '',
    tel: place.tel || '',
    group: place.group || '',
    created_at: now,
  });
  if (error) return { success: false, msg: error.message };
  return { success: true, place_id: newId };
}

async function deleteOtabiPlace(placeId: string) {
  const { error } = await supabase.from('otabi_places').delete().eq('place_id', Number(placeId));
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

// -------------------------------------------------------
// Otabi schedule
// -------------------------------------------------------

async function getOtabiSchedule(year: string, group: string, day?: string) {
  let query = supabase
    .from('otabi_schedules')
    .select('*')
    .eq('year', year);

  const { data, error } = await query;
  if (error) return { success: false, msg: error.message };

  const entries = (data || [])
    .filter((row) => {
      const rowGroup = row.group;
      if (rowGroup !== group && rowGroup !== '合同') return false;
      if (day && row.day !== day) return false;
      return true;
    })
    .map((row) => {
      const rowGroup = row.group;
      let displayNo = row.no;
      if (rowGroup === '合同') {
        if (group === '上組' && row.no_ue != null && row.no_ue !== '') displayNo = row.no_ue;
        else if (group === '下組' && row.no_shita != null && row.no_shita !== '') displayNo = row.no_shita;
      }
      return {
        entry_id: row.entry_id,
        year: row.year,
        group: row.group,
        day: row.day || '土曜',
        no: displayNo,
        no_ue: row.no_ue || '',
        no_shita: row.no_shita || '',
        time: row.time || '',
        place_id: row.place_id,
        place_name: row.place_name,
        memo: row.memo,
        donation: Number(row.donation) || 0,
        actual_time: row.actual_time || '',
      };
    })
    .sort((a, b) => Number(a.no) - Number(b.no));

  return { success: true, entries };
}

async function saveOtabiEntry(entry: Record<string, unknown>) {
  const now = new Date().toISOString();

  if (entry.entry_id) {
    const { error } = await supabase
      .from('otabi_schedules')
      .update({
        group: entry.group || '',
        day: entry.day || '土曜',
        no: entry.no || '',
        no_ue: entry.no_ue || '',
        no_shita: entry.no_shita || '',
        time: entry.time || '',
        place_id: entry.place_id || null,
        place_name: entry.place_name || '',
        memo: entry.memo || '',
        donation: Number(entry.donation) || 0,
        updated_at: now,
      })
      .eq('entry_id', Number(entry.entry_id));
    if (error) return { success: false, msg: error.message };
    return { success: true, entry_id: entry.entry_id };
  }

  const { data: last } = await supabase.from('otabi_schedules').select('entry_id').order('entry_id', { ascending: false }).limit(1);
  const newId = last && last.length > 0 ? last[0].entry_id + 1 : 1;

  const { error } = await supabase.from('otabi_schedules').insert({
    entry_id: newId,
    year: entry.year,
    group: entry.group || '',
    day: entry.day || '土曜',
    no: entry.no || '',
    no_ue: entry.no_ue || '',
    no_shita: entry.no_shita || '',
    time: entry.time || '',
    place_id: entry.place_id || null,
    place_name: entry.place_name || '',
    memo: entry.memo || '',
    donation: Number(entry.donation) || 0,
    actual_time: null,
    created_at: now,
    updated_at: now,
  });
  if (error) return { success: false, msg: error.message };
  return { success: true, entry_id: newId };
}

async function deleteOtabiEntry(entryId: string) {
  const { error } = await supabase.from('otabi_schedules').delete().eq('entry_id', Number(entryId));
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

async function copyOtabiSchedule(fromYear: string, toYear: string, group: string, day: string) {
  const { data: src } = await supabase
    .from('otabi_schedules')
    .select('*')
    .eq('year', fromYear)
    .eq('group', group)
    .eq('day', day);

  if (!src || src.length === 0) {
    return { success: false, msg: `${fromYear}年の${group}・${day}スケジュールが見つかりません` };
  }

  const { data: last } = await supabase.from('otabi_schedules').select('entry_id').order('entry_id', { ascending: false }).limit(1);
  let nextId = last && last.length > 0 ? last[0].entry_id + 1 : 1;
  const now = new Date().toISOString();

  for (const row of src) {
    await supabase.from('otabi_schedules').insert({
      entry_id: nextId++,
      year: toYear,
      group,
      day: row.day || '土曜',
      no: row.no || '',
      no_ue: row.no_ue || '',
      no_shita: row.no_shita || '',
      time: row.time || '',
      place_id: row.place_id || null,
      place_name: row.place_name || '',
      memo: row.memo || '',
      donation: 0,
      actual_time: null,
      created_at: now,
      updated_at: now,
    });
  }

  return { success: true, count: src.length };
}

async function markOtabiComplete(entryId: string, actualTime: string) {
  const { error } = await supabase
    .from('otabi_schedules')
    .update({ actual_time: actualTime, updated_at: new Date().toISOString() })
    .eq('entry_id', Number(entryId));
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

async function getOtabiAllProgress(year: string, day?: string) {
  let query = supabase.from('otabi_schedules').select('*').eq('year', year);
  if (day) query = query.eq('day', day);

  const { data, error } = await query;
  if (error) return { success: false, msg: error.message };

  const rawGroups: Record<string, unknown[]> = {};
  const jointEntries: unknown[] = [];

  (data || []).forEach((row) => {
    const group = row.group;
    const entry = {
      entry_id: row.entry_id,
      no: row.no,
      no_ue: row.no_ue || '',
      no_shita: row.no_shita || '',
      time: row.time || '',
      place_name: row.place_name,
      actual_time: row.actual_time || '',
      is_joint: group === '合同',
    };
    if (group === '合同') {
      jointEntries.push(entry);
    } else {
      if (!rawGroups[group]) rawGroups[group] = [];
      rawGroups[group].push(entry);
    }
  });

  const targetGroups = Object.keys(rawGroups).length > 0
    ? Object.keys(rawGroups)
    : jointEntries.length > 0 ? ['上組', '下組'] : [];

  const result: Record<string, unknown[]> = {};
  targetGroups.forEach((g) => {
    const joints = (jointEntries as Array<Record<string, unknown>>).map((e) => {
      const displayNo = g === '上組' && e.no_ue !== '' ? e.no_ue
        : g === '下組' && e.no_shita !== '' ? e.no_shita
        : e.no;
      return { ...e, no: displayNo };
    });
    result[g] = [...(rawGroups[g] || []) as Array<Record<string,unknown>>, ...joints]
      .sort((a: unknown, b: unknown) => Number((a as Record<string,unknown>).no) - Number((b as Record<string,unknown>).no));
  });

  return { success: true, groups: result };
}

async function getOtabiDonations(year: string) {
  const [{ data, error }, { data: extraData }] = await Promise.all([
    supabase
      .from('otabi_schedules')
      .select('entry_id,group,day,no,time,place_name,memo,donation')
      .eq('year', year)
      .order('group').order('day').order('no'),
    supabase
      .from('otabi_extra_donations')
      .select('id,group,day,place_name,donation')
      .eq('year', year)
      .order('id'),
  ]);

  if (error) return { success: false, msg: error.message };

  const entries = (data || []).map((row) => ({
    entry_id: row.entry_id,
    group: row.group,
    day: row.day || '土曜',
    no: row.no,
    time: row.time || '',
    place_name: row.place_name,
    memo: row.memo,
    donation: Number(row.donation) || 0,
    extra: false,
  }));

  const extras = (extraData || []).map((row) => ({
    extra_id: row.id,
    group: row.group,
    day: row.day || '土曜',
    no: '',
    time: '',
    place_name: row.place_name,
    memo: '',
    donation: Number(row.donation) || 0,
    extra: true,
  }));

  const allEntries = [...entries, ...extras];
  const total = allEntries.reduce((s, e) => s + e.donation, 0);
  const byGroup: Record<string, number> = {};
  allEntries.forEach((e) => { byGroup[e.group] = (byGroup[e.group] || 0) + e.donation; });

  return { success: true, entries: allEntries, total, byGroup };
}

async function addOtabiExtraDonation(year: string, group: string, day: string, place_name: string, donation: number) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('otabi_extra_donations')
    .insert({ year, group, day, place_name, donation, created_at: now, updated_at: now })
    .select()
    .single();
  if (error) return { success: false, msg: error.message };
  return { success: true, entry: { extra_id: data.id, group: data.group, day: data.day, no: '', time: '', place_name: data.place_name, memo: '', donation: data.donation, extra: true } };
}

async function updateOtabiExtraDonation(id: number, donation: number) {
  const { error } = await supabase
    .from('otabi_extra_donations')
    .update({ donation, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

async function deleteOtabiExtraDonation(id: number) {
  const { error } = await supabase.from('otabi_extra_donations').delete().eq('id', id);
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

async function saveOtabiDonations(donations: Array<Record<string, unknown>>) {
  const now = new Date().toISOString();
  let count = 0;
  for (const d of donations || []) {
    if (d.extra) {
      const { error } = await supabase
        .from('otabi_extra_donations')
        .update({ donation: Number(d.donation) || 0, updated_at: now })
        .eq('id', Number(d.extra_id));
      if (!error) count++;
    } else {
      const { error } = await supabase
        .from('otabi_schedules')
        .update({ donation: Number(d.donation) || 0, updated_at: now })
        .eq('entry_id', Number(d.entry_id));
      if (!error) count++;
    }
  }
  return { success: true, count };
}

async function reorderOtabiEntries(updates: Array<Record<string, unknown>>) {
  const now = new Date().toISOString();
  for (const u of updates || []) {
    await supabase.from('otabi_schedules').update({ no: u.no, updated_at: now }).eq('entry_id', Number(u.entry_id));
  }
  return { success: true, count: updates.length };
}

// -------------------------------------------------------
// Participation stats
// -------------------------------------------------------

async function getParticipationStats(filter: string) {
  const { data: usersData } = await supabase.from('users').select('user_id,stored_name,created_at').eq('status', 'active');
  const members = (usersData || []).map((u) => ({
    userId: u.user_id,
    name: u.stored_name,
    createdAt: u.created_at ? new Date(u.created_at) : null,
  }));

  if (filter === 'practice') {
    const { data: practices } = await supabase.from('practices').select('practice_id,date');
    const { data: answers } = await supabase.from('answers_practices').select('user_id,practice_id,status');

    const stats = members.map((m) => {
      const eligible = (practices || []).filter((p) => !m.createdAt || new Date(p.date) >= m.createdAt);
      const total = eligible.length;
      if (!total) return { name: m.name, participated: 0, total: 0, rate: 0 };
      const eligibleIds = new Set(eligible.map((p) => p.practice_id));
      const absent = (answers || []).filter((a) =>
        a.user_id === m.userId &&
        (a.status === '欠席' || a.status === '遅刻') &&
        eligibleIds.has(a.practice_id)
      ).length;
      const participated = total - absent;
      return { name: m.name, participated, total, rate: participated / total };
    });

    stats.sort((a, b) => b.rate - a.rate);
    return { success: true, stats };
  }

  // event stats
  const { data: events } = await supabase.from('events').select('event_id,date');
  const { data: answers } = await supabase.from('answers_events').select('user_id,event_id,status');

  const stats = members.map((m) => {
    const eligible = (events || []).filter((ev) => !m.createdAt || new Date(ev.date) >= m.createdAt);
    const total = eligible.length;
    if (!total) return { name: m.name, participated: 0, total: 0, rate: 0 };
    const eligibleIds = new Set(eligible.map((ev) => ev.event_id));
    const participated = (answers || []).filter((a) =>
      a.user_id === m.userId && a.status === '参加' && eligibleIds.has(a.event_id)
    ).length;
    return { name: m.name, participated, total, rate: participated / total };
  });

  stats.sort((a, b) => b.rate - a.rate);
  return { success: true, stats };
}

// -------------------------------------------------------
// Memos
// -------------------------------------------------------

async function getMemos() {
  const { data, error } = await supabase.from('memos').select('*').order('created_at', { ascending: false });
  if (error) return { success: false, msg: error.message };
  return { success: true, memos: (data || []).map((m) => ({ ...m, memo_id: m.memo_id, date: m.created_at })) };
}

async function saveMemo(text: string, userId: string) {
  const { data: userRow } = await supabase.from('users').select('stored_name').eq('user_id', Number(userId)).single();
  const userName = userRow?.stored_name || '名無し';
  const now = new Date().toISOString();
  const memoId = Date.now();

  const { error } = await supabase.from('memos').insert({
    memo_id: memoId,
    user_id: Number(userId),
    user_name: userName,
    text,
    created_at: now,
  });
  if (error) return { success: false, msg: error.message };
  return { success: true, memo_id: memoId };
}

async function deleteMemo(memoId: string, userId: string) {
  const { data: memo } = await supabase.from('memos').select('user_id').eq('memo_id', Number(memoId)).single();
  if (!memo) return { success: false, msg: 'not found' };

  const { data: userRow } = await supabase.from('users').select('role').eq('user_id', Number(userId)).single();
  const isAdmin = userRow?.role === 'admin';

  if (memo.user_id !== Number(userId) && !isAdmin) return { success: false, msg: '権限がありません' };

  const { error } = await supabase.from('memos').delete().eq('memo_id', Number(memoId));
  if (error) return { success: false, msg: error.message };
  return { success: true };
}

// -------------------------------------------------------
// Gear
// -------------------------------------------------------

const GEAR_COLS = ['happi_no', 'tshirt_size', 'tekkou', 'hakama', 'kimono_top', 'kimono_bottom', 'memo'];

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase.from('users').select('role').eq('user_id', Number(userId)).single();
  return data?.role === 'admin';
}

async function getGear() {
  const [usersRes, gearRes, childrenRes, childGearRes] = await Promise.all([
    supabase.from('users').select('user_id,stored_name,role').eq('status', 'active'),
    supabase.from('member_gear').select('*'),
    supabase.from('children').select('child_id,user_id,child_name').neq('status', 'deleted'),
    supabase.from('child_gear').select('*'),
  ]);

  const gearMap: Record<string, Record<string, unknown>> = {};
  (gearRes.data || []).forEach((r) => {
    const obj: Record<string, unknown> = {};
    GEAR_COLS.forEach((col) => { obj[col] = r[col] ?? ''; });
    gearMap[String(r.user_id)] = obj;
  });

  const childGearMap: Record<string, { kimono_top: string; kimono_bottom: string }> = {};
  (childGearRes.data || []).forEach((r) => {
    childGearMap[String(r.child_id)] = { kimono_top: r.kimono_top ?? '', kimono_bottom: r.kimono_bottom ?? '' };
  });

  const childrenByUser: Record<string, Array<{ childId: number; childName: string }>> = {};
  (childrenRes.data || []).forEach((c) => {
    const uid = String(c.user_id);
    if (!childrenByUser[uid]) childrenByUser[uid] = [];
    childrenByUser[uid].push({ childId: c.child_id, childName: c.child_name });
  });

  return {
    success: true,
    members: (usersRes.data || []).map((u) => ({
      userId: String(u.user_id),
      name: u.stored_name,
      role: u.role,
      gear: gearMap[String(u.user_id)] || {},
      children: (childrenByUser[String(u.user_id)] || []).map((c) => ({
        ...c,
        gear: childGearMap[String(c.childId)] || {},
      })),
    })),
  };
}

async function saveGear(targetUserId: string, gear: Record<string, unknown>, requestUserId: string) {
  if (!(await isAdmin(requestUserId))) return { success: false, msg: '権限がありません' };

  const { data: existing } = await supabase.from('member_gear').select('id').eq('user_id', Number(targetUserId)).single();

  const gearData: Record<string, unknown> = { user_id: Number(targetUserId) };
  GEAR_COLS.forEach((col) => { gearData[col] = gear[col] ?? ''; });

  if (existing) {
    await supabase.from('member_gear').update(gearData).eq('id', existing.id);
  } else {
    await supabase.from('member_gear').insert(gearData);
  }

  return { success: true };
}

async function getGearSpare() {
  const { data: items } = await supabase.from('gear_spare').select('*');
  const { data: gearRows } = await supabase.from('member_gear').select('tshirt_size');

  const tshirtUsage: Record<string, number> = {};
  (gearRows || []).forEach((r) => {
    const size = String(r.tshirt_size || '').trim();
    if (size) tshirtUsage[size] = (tshirtUsage[size] || 0) + 1;
  });

  const result = (items || []).map((r) => ({
    item_type: r.item_type,
    value: String(r.value),
    quantity: Number(r.quantity) || 0,
    ...(r.item_type === 'Tシャツ' ? { member_count: tshirtUsage[String(r.value)] || 0 } : {}),
  }));

  // Add tshirt sizes used by members but not in master
  Object.entries(tshirtUsage).forEach(([size, count]) => {
    if (!result.find((i) => i.item_type === 'Tシャツ' && i.value === size)) {
      result.push({ item_type: 'Tシャツ', value: size, quantity: 0, member_count: count });
    }
  });

  return { success: true, items: result };
}

async function upsertGearSpare(item_type: string, value: string, quantity: number, requestUserId: string) {
  if (!(await isAdmin(requestUserId))) return { success: false, msg: '権限がありません' };
  if (!['Tシャツ', '手甲'].includes(item_type)) return { success: false, msg: '不正な種別' };

  const { data: existing } = await supabase
    .from('gear_spare')
    .select('id')
    .eq('item_type', item_type)
    .eq('value', value)
    .single();

  if (existing) {
    if (quantity <= 0) {
      await supabase.from('gear_spare').delete().eq('id', existing.id);
    } else {
      await supabase.from('gear_spare').update({ quantity }).eq('id', existing.id);
    }
  } else if (quantity > 0) {
    await supabase.from('gear_spare').insert({ item_type, value, quantity });
  }

  return { success: true };
}

async function saveChildGear(childId: string, gear: Record<string, unknown>, requestUserId: string) {
  if (!(await isAdmin(requestUserId))) return { success: false, msg: '権限がありません' };

  const { data: existing } = await supabase.from('child_gear').select('id').eq('child_id', Number(childId)).single();

  const gearData = { child_id: Number(childId), kimono_top: gear.kimono_top ?? '', kimono_bottom: gear.kimono_bottom ?? '' };

  if (existing) {
    await supabase.from('child_gear').update(gearData).eq('id', existing.id);
  } else {
    await supabase.from('child_gear').insert(gearData);
  }

  return { success: true };
}

// -------------------------------------------------------
// My page
// -------------------------------------------------------

async function getMyPage(userId: string) {
  const uid = Number(userId);

  const [userRes, gearRes, eventsRes, ansEventsRes, practicesRes, ansPracticesRes, childrenRes, childGearRes] = await Promise.all([
    supabase.from('users').select('*').eq('user_id', uid).single(),
    supabase.from('member_gear').select('*').eq('user_id', uid).single(),
    supabase.from('events').select('event_id,date'),
    supabase.from('answers_events').select('event_id,status').eq('user_id', uid),
    supabase.from('practices').select('practice_id,date'),
    supabase.from('answers_practices').select('practice_id,status').eq('user_id', uid),
    supabase.from('children').select('child_id,child_name,birthday,status').eq('user_id', uid).neq('status', 'deleted'),
    supabase.from('children').select('child_id').eq('user_id', uid).neq('status', 'deleted').then(async (r) => {
      const ids = (r.data || []).map((c) => c.child_id);
      if (!ids.length) return { data: [] };
      return supabase.from('child_gear').select('child_id,kimono_top,kimono_bottom').in('child_id', ids);
    }),
  ]);

  if (!userRes.data) return { success: false, msg: 'user not found' };
  const u = userRes.data;

  const user = {
    name: u.stored_name,
    role: u.role,
    position: u.position || '',
    phone: u.phone || '',
    prefecture: u.prefecture || '',
    city: u.city || '',
    addressDetail: u.address_detail || '',
    birthday: u.birthday ? new Date(u.birthday).toISOString().slice(0, 10) : '',
    createdAt: u.created_at,
  };

  const gear: Record<string, unknown> = {};
  if (gearRes.data) GEAR_COLS.forEach((col) => { gear[col] = gearRes.data![col] ?? ''; });

  // Event rate
  const userCreated = user.createdAt ? new Date(user.createdAt) : null;
  const eligibleEvents = (eventsRes.data || []).filter((ev) => !userCreated || new Date(ev.date) >= userCreated);
  const eventAnswers = new Map((ansEventsRes.data || []).map((a) => [a.event_id, a.status]));
  const eventParticipated = eligibleEvents.filter((ev) => eventAnswers.get(ev.event_id) === '参加').length;
  const eventRate = eligibleEvents.length > 0
    ? { participated: eventParticipated, total: eligibleEvents.length, rate: eventParticipated / eligibleEvents.length }
    : null;

  // Practice rate
  const eligiblePractices = (practicesRes.data || []).filter((p) => !userCreated || new Date(p.date) >= userCreated);
  const practiceAnswers = new Map((ansPracticesRes.data || []).map((a) => [a.practice_id, a.status]));
  const absent = eligiblePractices.filter((p) => {
    const s = practiceAnswers.get(p.practice_id);
    return s === '欠席' || s === '遅刻';
  }).length;
  const practiceParticipated = eligiblePractices.length - absent;
  const practiceRate = eligiblePractices.length > 0
    ? { participated: practiceParticipated, total: eligiblePractices.length, rate: practiceParticipated / eligiblePractices.length }
    : null;

  const childGearMap: Record<number, { kimono_top: string; kimono_bottom: string }> = {};
  (childGearRes.data || []).forEach((g) => {
    childGearMap[g.child_id] = { kimono_top: g.kimono_top ?? '', kimono_bottom: g.kimono_bottom ?? '' };
  });

  const children = (childrenRes.data || []).map((c) => ({
    childId: c.child_id,
    childName: c.child_name,
    birthday: c.birthday ? new Date(c.birthday).toISOString().slice(0, 10) : '',
    status: c.status,
    gear: childGearMap[c.child_id] || {},
  }));

  return { success: true, user, gear, eventRate, practiceRate, children };
}
