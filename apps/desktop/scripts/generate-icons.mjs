import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir, mkdtemp, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const source = join(repository, 'assets/brand/opm-studio-mark.svg');
const assets = join(repository, 'apps/desktop/assets');
const temporary = await mkdtemp(join(tmpdir(), 'opm-icons-'));
await mkdir(assets, { recursive: true });
const svg = await readFile(source, 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
  const images = new Map();
  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    await page.setViewportSize({ width: size, height: size });
    images.set(size, await page.screenshot({ omitBackground: true }));
  }
  await writeFile(join(assets, 'opm-studio.png'), images.get(1024));
  // ICO 目录使用标准 PNG 图像负载，保留 Windows 所需的多个尺寸。
  const sizes = [16, 32, 48, 64, 128, 256], header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  sizes.forEach((size, index) => {
    const entry = 6 + index * 16, png = images.get(size);
    header[entry] = header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4); header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8); header.writeUInt32LE(offset, entry + 12); offset += png.length;
  });
  await writeFile(join(assets, 'opm-studio.ico'), Buffer.concat([header, ...sizes.map(size => images.get(size))]));
  if (process.platform === 'darwin') {
    const iconset = join(temporary, 'opm-studio.iconset'); await mkdir(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      await writeFile(join(iconset, `icon_${size}x${size}.png`), images.get(size));
      await writeFile(join(iconset, `icon_${size}x${size}@2x.png`), images.get(size * 2));
    }
    await promisify(execFile)('iconutil', ['-c', 'icns', '-o', join(assets, 'opm-studio.icns'), iconset]);
  }
  for (const folder of ['apps/web/public', 'apps/desktop/ui']) {
    await mkdir(join(repository, folder), { recursive: true });
    await copyFile(source, join(repository, folder, 'opm-studio.svg'));
  }
  const image = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  await page.setViewportSize({ width: 1200, height: 760 });
  await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#eef3fa;color:#1c2d44}.main{display:flex;align-items:center;gap:44px;padding:60px 80px;background:white;height:390px}.main img{width:270px;height:270px}h1{font-size:46px;letter-spacing:-1.5px;margin:0 0 12px;font-weight:720}p{font-size:17px;color:#61728b}.samples{display:flex;gap:50px;align-items:center;padding:30px 80px;height:135px}.sample{text-align:center}.sample small{display:block;margin-top:9px;color:#61728b}.dark{background:#17212b;color:white;display:flex;align-items:center;justify-content:space-between;padding:0 80px;height:135px}.lockup{display:flex;align-items:center;gap:10px;font-size:23px;font-weight:700}.lockup img{width:48px;height:48px}.dark span{font-size:15px;color:#9eb1c9}</style><div class="main"><img src="${image}"><div><h1>OPM Studio</h1><p>对象 · 过程 · 关系</p><p>从业务分析到模型表达</p></div></div><div class="samples">${[16,32,48,64,96].map(size=>`<div class="sample"><img src="${image}" width="${size}" height="${size}"><small>${size} px</small></div>`).join('')}</div><div class="dark"><div class="lockup"><img src="${image}">OPM Studio</div><span>应用图标 / 页头 Logo / 浏览器标签</span></div>`);
  await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
  await page.screenshot({ path: join(assets, 'preview.png') });
  console.log('图标已生成并同步：SVG、1024px PNG、多尺寸 ICO、预览图' + (process.platform === 'darwin' ? '、ICNS。' : '；ICNS 请在 macOS 生成。'));
} finally { await browser.close(); await rm(temporary, { recursive: true, force: true }); }
