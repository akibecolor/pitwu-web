/**
 * contact.gs — サイトの問い合わせフォーム受け口（Google Apps Script ウェブアプリ）
 *
 * なぜ Apps Script なのか:
 *   従来は /contact のフォームから Google フォームの formResponse へ直接 POST していたが、
 *   Google フォーム側が送信時に invisible reCAPTCHA を必須化したため、素の fetch では
 *   トークンを作れず HTTP 400 で破棄されるようになった（＝問い合わせが全て消えていた）。
 *   Apps Script のウェブアプリは reCAPTCHA の制約を受けず、成功/失敗も正しく返せる。
 *
 * デプロイ手順は docs/operations.md「問い合わせフォーム」を参照。
 *
 * 必要なスクリプトプロパティ（プロジェクトの設定 → スクリプト プロパティ）:
 *   SHARED_SECRET   … Cloudflare Pages の CONTACT_SHARED_SECRET と同じ値（必須）
 *   SPREADSHEET_ID  … 記録先スプレッドシートの ID（必須）
 *   NOTIFY_TO       … 事務局への通知先メール（任意／既定 contact@pitwu.com）
 *   SHEET_NAME      … 記録先シート名（任意／既定「サイト問い合わせ」）
 */

var DEFAULT_NOTIFY_TO = 'contact@pitwu.com';
var DEFAULT_SHEET_NAME = 'サイト問い合わせ';

// スプレッドシートの列順。フォーム連携シートとは別タブに書くため、
// フォーム側の増減に影響されない固定順で扱う。
var COLUMNS = [
  '受信日時',
  'メールアドレス',
  'お名前',
  'LINE',
  'X（旧Twitter）',
  '年代',
  '性別',
  '投稿種別',
  '質問内容',
];

function prop(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v && v.trim() ? v.trim() : fallback;
}

function jsonOut(obj, status) {
  // Apps Script は HTTP ステータスを自由に設定できないため、ok フラグで表現する。
  // 呼び出し側（functions/api/contact.ts）は body.ok を見て判定する。
  obj.status = status;
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: 'empty body' }, 400);
    }

    var payload = JSON.parse(e.postData.contents);

    var secret = prop('SHARED_SECRET', '');
    if (!secret) return jsonOut({ ok: false, error: 'SHARED_SECRET not configured' }, 500);
    if (payload.secret !== secret) return jsonOut({ ok: false, error: 'unauthorized' }, 401);

    var email = String(payload.email || '').trim();
    var name = String(payload.name || '').trim();
    var body = String(payload.body || '').trim();
    var age = String(payload.age || '').trim();
    var gender = String(payload.gender || '').trim();
    var type = String(payload.type || '').trim();
    var line = String(payload.line || '').trim();
    var twitter = String(payload.twitter || '').trim();

    // 必須項目（サイト側でも検証しているが、ここでも守る）
    var missing = [];
    if (!email) missing.push('email');
    if (!name) missing.push('name');
    if (!age) missing.push('age');
    if (!gender) missing.push('gender');
    if (!type) missing.push('type');
    if (!body) missing.push('body');
    if (missing.length) {
      return jsonOut({ ok: false, error: '必須項目が未入力です: ' + missing.join(', ') }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonOut({ ok: false, error: 'メールアドレスの形式が不正です' }, 400);
    }

    var sheetId = prop('SPREADSHEET_ID', '');
    if (!sheetId) return jsonOut({ ok: false, error: 'SPREADSHEET_ID not configured' }, 500);

    var receivedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    var row = [receivedAt, email, name, line, twitter, age, gender, type, body];

    // 記録が最優先。ここで失敗したら 500 を返して呼び出し側にリトライ判断を委ねる。
    var sheetName = prop('SHEET_NAME', DEFAULT_SHEET_NAME);
    var ss = SpreadsheetApp.openById(sheetId);
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(COLUMNS);
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(COLUMNS);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow(row);

    // メール送信は記録より優先度が低い。失敗しても「受付済み」として ok を返し、
    // 事務局が取りこぼさないようにログへ残す。
    var mailWarning = '';
    try {
      sendMails(email, name, { age: age, gender: gender, type: type, body: body, line: line, twitter: twitter });
    } catch (mailErr) {
      mailWarning = String(mailErr);
      console.error('mail failed: ' + mailWarning);
    }

    return jsonOut({ ok: true, mailWarning: mailWarning }, 200);
  } catch (err) {
    console.error(err);
    return jsonOut({ ok: false, error: String(err) }, 500);
  }
}

function sendMails(email, name, d) {
  var notifyTo = prop('NOTIFY_TO', DEFAULT_NOTIFY_TO);

  // 1) 問い合わせ者への受付確認メール
  var ack =
    name +
    ' 様\n\n' +
    'よさこいチーム「夢源風人（むげんかじぴとぅ）」です。\n' +
    'お問い合わせを受け付けました。担当より順次ご返信いたします。\n\n' +
    '──────────── お問い合わせ内容 ────────────\n' +
    'お名前　　： ' + name + '\n' +
    'メール　　： ' + email + '\n' +
    (d.line ? 'LINE　　　： ' + d.line + '\n' : '') +
    (d.twitter ? 'X　　　　： ' + d.twitter + '\n' : '') +
    '年代　　　： ' + d.age + '\n' +
    '性別　　　： ' + d.gender + '\n' +
    '投稿種別　： ' + d.type + '\n' +
    '質問内容　：\n' + d.body + '\n' +
    '────────────────────────────────\n\n' +
    '※本メールは送信内容の自動控えです。返信は不要です。\n' +
    '※数日たっても返信が届かない場合は、迷惑メールフォルダをご確認のうえ\n' +
    '　LINE（@cca1992y）よりお問い合わせください。\n\n' +
    '夢源風人\nhttps://pitwu.com/\n';

  MailApp.sendEmail({
    to: email,
    subject: '【夢源風人】お問い合わせを受け付けました',
    body: ack,
    name: '夢源風人 事務局',
    replyTo: notifyTo,
  });

  // 2) 事務局への通知メール（返信でそのまま問い合わせ者へ返せるよう replyTo を設定）
  var notice =
    'サイトの問い合わせフォームから新しい問い合わせが届きました。\n\n' +
    'お名前　　： ' + name + '\n' +
    'メール　　： ' + email + '\n' +
    (d.line ? 'LINE　　　： ' + d.line + '\n' : '') +
    (d.twitter ? 'X　　　　： ' + d.twitter + '\n' : '') +
    '年代　　　： ' + d.age + '\n' +
    '性別　　　： ' + d.gender + '\n' +
    '投稿種別　： ' + d.type + '\n' +
    '質問内容　：\n' + d.body + '\n';

  MailApp.sendEmail({
    to: notifyTo,
    subject: '【サイト問い合わせ】' + d.type + '／' + name + ' 様',
    body: notice,
    name: 'pitwu.com 問い合わせフォーム',
    replyTo: email,
  });
}

/**
 * 疎通確認用。ブラウザでウェブアプリの URL を開いたときに表示される。
 * 実際の送信は POST のみ受け付ける。
 */
function doGet() {
  return jsonOut({ ok: true, message: 'pitwu contact endpoint is alive' }, 200);
}
