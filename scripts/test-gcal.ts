/**
 * Google Calendar API 疎通確認スクリプト
 * 実行: npx tsx scripts/test-gcal.ts
 */

import { createSign } from 'crypto';
import { loadEnv } from './lib/env.js';

const env = loadEnv();

const SERVICE_EMAIL = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY   = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!SERVICE_EMAIL || !PRIVATE_KEY) {
  console.error('❌ GOOGLE_SERVICE_ACCOUNT_EMAIL または GOOGLE_PRIVATE_KEY が未設定です');
  process.exit(1);
}

console.log('📧 サービスアカウント:', SERVICE_EMAIL);
console.log('🔑 秘密鍵:', PRIVATE_KEY.substring(0, 40) + '...');

// JWT を生成してアクセストークンを取得
async function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss:   SERVICE_EMAIL,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(PRIVATE_KEY, 'base64url');

  const jwt = `${header}.${payload}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) throw new Error(`${data.error}: ${data.error_description}`);
  return data.access_token;
}

// カレンダーの直近イベントを取得
const CALENDARS = [
  { id: '80s4qcc8jd7hisb0k03vkist6g@group.calendar.google.com', name: 'イベント' },
  { id: 'slfifr2ssskd7c6e343jla5i00@group.calendar.google.com', name: '練習' },
];

console.log('\n⏳ アクセストークン取得中...');
try {
  const token = await getAccessToken();
  console.log('✅ 認証成功！\n');

  for (const cal of CALENDARS) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`
      + `?timeMin=${new Date().toISOString()}&maxResults=3&singleEvents=true&orderBy=startTime`;
    const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json() as { items?: { summary?: string; start?: { dateTime?: string; date?: string } }[]; error?: { message: string } };

    if (data.error) {
      console.log(`❌ [${cal.name}] ${data.error.message}`);
      continue;
    }

    console.log(`📅 [${cal.name}] 直近の予定 ${data.items?.length ?? 0} 件:`);
    for (const ev of data.items ?? []) {
      const d = ev.start?.dateTime ?? ev.start?.date ?? '';
      console.log(`  - ${new Date(d).toLocaleString('ja-JP')} : ${ev.summary}`);
    }
    console.log();
  }
} catch (e) {
  console.error('❌ エラー:', e);
  process.exit(1);
}
