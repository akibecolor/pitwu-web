/**
 * generate-favicon.ts — public/kumo-logo.eps.png を加工しファビコン一式を出力する
 * - 白背景を除去し、ロゴ部分は白（RGB）＋アルファで表現（小サイズでもにじみにくい）
 * - 群青グラデ＋角丸の台の上に中央配置
 * 実行: npm run icons ／ npx tsx scripts/generate-favicon.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import toIco from 'to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const KUMO_SRC = path.join(root, 'public', 'kumo-logo.eps.png');

const CANVAS = 512;
/** ロゴを載せる最大枠（パディング込みでキャンバス内に収める） */
const LOGO_BOX = 440;
/** これより明るい画素は背景（透過）とみなす */
const WHITE_CUTOFF = 248;

/**
 * 白背景を抜き、線は白インクに変換。濃淡はアルファへ移し、縁のグレーを自然に合成する。
 */
async function extractWhiteLogo(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum >= WHITE_CUTOFF) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    } else {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      const t = Math.max(0, Math.min(1, 1 - lum / WHITE_CUTOFF));
      out[i + 3] = Math.round(255 * t);
    }
  }
  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** 角丸＋群青グラデのベース PNG */
async function roundedGradientBackground(size: number, radius: number): Promise<Buffer> {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1B3F8B"/>
      <stop offset="100%" stop-color="#152a66"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function buildMasterIcon(): Promise<Buffer> {
  const raw = fs.readFileSync(KUMO_SRC);
  const cut = await extractWhiteLogo(raw);
  const resized = await sharp(cut)
    .resize(LOGO_BOX, LOGO_BOX, { fit: 'inside' })
    .png()
    .toBuffer();
  const { width: w = 1, height: h = 1 } = await sharp(resized).metadata();
  const bg = await roundedGradientBackground(CANVAS, Math.round(CANVAS * 0.2));
  const left = Math.round((CANVAS - w) / 2);
  const top = Math.round((CANVAS - h) / 2);
  return sharp(bg)
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(KUMO_SRC)) {
    console.error('Missing source:', KUMO_SRC);
    process.exit(1);
  }

  const master = await buildMasterIcon();
  const png32 = await sharp(master).resize(32, 32).png().toBuffer();
  const png16 = await sharp(master).resize(16, 16).png().toBuffer();
  const png128 = await sharp(master).resize(128, 128).png().toBuffer();

  fs.writeFileSync(path.join(root, 'public', 'favicon.png'), png32);
  fs.writeFileSync(path.join(root, 'public', 'favicon-preview-512.png'), master);
  await sharp(master).resize(180, 180).png().toFile(path.join(root, 'public', 'apple-touch-icon.png'));

  const ico = await toIco([png16, png32], { sizes: [16, 32] });
  fs.writeFileSync(path.join(root, 'public', 'favicon.ico'), ico);

  const b64 = png128.toString('base64');
  const svgOut = `<!-- favicon.svg — npm run icons で生成（元: public/kumo-logo.eps.png） -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="夢源風人">
  <image href="data:image/png;base64,${b64}" width="128" height="128" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;
  fs.writeFileSync(path.join(root, 'public', 'favicon.svg'), svgOut, 'utf8');

  console.log(
    'OK: favicon.svg, favicon.png(32), favicon.ico, apple-touch-icon.png(180), favicon-preview-512.png',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
