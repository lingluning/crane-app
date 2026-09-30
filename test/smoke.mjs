// ブラウザでアプリを実際に動かして主要フローを検証する冒烟テスト。
//   npm install && npm test
// three.js / Tailwind / フォント / 天気 API の CDN は node_modules とスタブで差し替えるので
// オフライン（CDN が塞がれた CI など）でも動く。index.html 自体は一切書き換えない。

import puppeteer from 'puppeteer';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const THREE_ROOT = path.join(ROOT, 'node_modules', 'three');
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/';

// ---------- 静的サーバ ----------
const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.bin': 'application/octet-stream',
};
const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, rel === '/' ? '/index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- ブラウザ ----------
const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });

const CORS = { 'Access-Control-Allow-Origin': '*' };
await page.setRequestInterception(true);
page.on('request', req => {
    const u = req.url();
    if (u.startsWith(THREE_CDN)) {
        const f = path.join(THREE_ROOT, u.slice(THREE_CDN.length));
        return fs.existsSync(f)
            ? req.respond({ status: 200, contentType: 'text/javascript', headers: CORS, body: fs.readFileSync(f, 'utf8') })
            : req.respond({ status: 404, headers: CORS, body: '' });
    }
    if (u.startsWith('https://cdn.tailwindcss.com')) {
        return req.respond({ status: 200, contentType: 'text/javascript', headers: CORS, body: '' });
    }
    if (u.startsWith('https://')) {   // フォント・天気 API など外部はすべて空応答
        return req.respond({ status: 200, contentType: 'text/plain', headers: CORS, body: '{}' });
    }
    return req.continue();
});

const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) pageErrors.push(m.text());
});
page.on('dialog', d => d.accept());

const wait = ms => new Promise(r => setTimeout(r, ms));
const click = sel => page.$eval(sel, el => el.click());
const text = sel => page.$eval(sel, el => el.textContent.trim());
const count = type => page.$eval(`#count-${type}`, el => Number(el.textContent));

// ---------- アサーション ----------
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : `  — ${detail}`}`);
}
async function noNewErrors(name, fn) {
    const before = pageErrors.length;
    await fn();
    const fresh = pageErrors.slice(before);
    check(name, fresh.length === 0, fresh.join(' | '));
}

// プロジェクト JSON を取込ボタン経由で読み込む（ユーザー操作と同じ経路）
const TMP_DIR = fs.mkdtempSync(path.join(ROOT, 'test', '.tmp-'));
async function importProject(obj) {
    const file = path.join(TMP_DIR, `p${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(obj));
    const input = await page.$('#import-file');
    await input.uploadFile(file);
    await wait(800);
}

try {
    await page.evaluateOnNewDocument(() => localStorage.clear());
    await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction(
        () => getComputedStyle(document.getElementById('loading')).display === 'none',
        { timeout: 60000 }
    ).catch(() => {});
    await wait(1500);

    console.log('起動');
    check('起動時にページエラーなし', pageErrors.length === 0, pageErrors.join(' | '));
    check('3D キャンバスが描画されている', await page.$('body > canvas') !== null);

    console.log('配置 / 撤銷 / 重做');
    await page.mouse.click(800, 500);                  // 起動時はクレーンツール
    await wait(600);
    check('クレーンを配置できる', await count('crane') === 1);

    await click('.tool-btn[data-tool="loadPick"]');
    await page.mouse.click(900, 550); await wait(400);
    await page.mouse.click(700, 450); await wait(400);
    check('起吊点を 2 つ配置できる', await count('loadPick') === 2);

    // クレーンを選択した状態で撤銷する（パネルが残らないことの確認用）。
    // 配置クリック点（地面の枢軸）はシャーシ下の隙間でレイが抜けることがあるので、
    // 同じモジュールインスタンスを import してモデル外接箱の中心を画面座標にして押す。
    const craneScreen = await page.evaluate(async () => {
        const THREE = await import('three');
        const { state } = await import('./js/state.js');
        const { camera } = await import('./js/scene.js');
        const crane = state.placedObjects.find(o => o.userData.type === 'crane');
        const p = new THREE.Box3().setFromObject(crane).getCenter(new THREE.Vector3()).project(camera);
        return [Math.round((p.x + 1) / 2 * innerWidth), Math.round((1 - p.y) / 2 * innerHeight)];
    });
    await click('.tool-btn[data-tool="select"]');
    await page.mouse.click(craneScreen[0], craneScreen[1]); await wait(300);
    check('クレーン選択で制御パネルが開く',
        !(await page.$eval('#crane-control', el => el.classList.contains('hidden'))));
    for (let i = 0; i < 2; i++) {
        await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
        await wait(400);
    }
    check('Ctrl+Z ×2 で起吊点が 0 に戻る', await count('loadPick') === 0);
    check('撤銷後に選択パネルが残らない',
        await page.$eval('#info-panel', el => el.classList.contains('hidden')) &&
        await page.$eval('#crane-control', el => el.classList.contains('hidden')));

    await page.keyboard.down('Control'); await page.keyboard.press('KeyY'); await page.keyboard.up('Control');
    await wait(400);
    check('Ctrl+Y で 1 つ戻る', await count('loadPick') === 1);

    console.log('方案タブ');
    await click('#sheet-tabs .sheet-tab[data-tab-id="tabB"]'); await wait(800);
    check('方案 B は空', await count('crane') === 0);
    await click('#sheet-tabs .sheet-tab[data-tab-id="tabA"]'); await wait(800);
    check('方案 A に戻ると内容が復元される', await count('crane') === 1 && await count('loadPick') === 1);
    check('アクティブタブが保存される',
        await page.evaluate(() => localStorage.getItem('crane_active_tab')) === 'tabA');

    console.log('入力欄のキー操作');
    await click('#settings-btn'); await wait(300);
    await page.focus('#set-site-name');
    await page.type('#set-site-name', 'ABC');
    await page.keyboard.press('Backspace');
    check('入力欄の Backspace は文字だけ消す',
        await page.$eval('#set-site-name', el => el.value) === 'AB' && await count('crane') === 1);
    await click('#settings-cancel'); await wait(300);

    console.log('プロジェクト出力 / 取込');
    await noNewErrors('出力ボタンが例外を出さない', async () => { await click('#export-json-btn'); await wait(500); });

    // クレーンの実座標（地形上）を取得して、そこを基準に検証用シーンを組み立てる
    await page.mouse.move(800, 500); await wait(200);
    const coord = await text('#coord-display');
    const m = coord.match(/X=(-?[\d.]+), Z=(-?[\d.]+)/);
    const cx = Number(m[1]), cz = Number(m[2]);
    const at = (dx, dz, y = 0) => ({ x: cx + dx, y, z: cz + dz });
    const craneItem = { type: 'crane', position: at(0, 0), rotation: 0, workRadius: 10 };

    // 計画書に悪意ある HTML を混ぜて取り込み、iframe で実行されないことを確認する
    await importProject({
        version: '2.0',
        scene: { version: '1.1', objects: [craneItem] },
        plan: {
            fields: { __probe: '<img src=x onerror="parent.__planXss=1">安全<script>parent.__planXss=2</script>' },
            checkboxes: {}, images: { __probe: 'javascript:parent.__planXss=3' }
        }
    });
    check('取込で計画書データが保存される',
        await page.evaluate(() => !!JSON.parse(localStorage.getItem('crane_cf19_cadpro_v1') || 'null')?.fields?.__probe));

    const sanitized = await page.evaluate(async () => {
        // loadSaved と同じ処理を計画書ページ上で実行させて、無害化の結果を見る
        const frame = document.getElementById('plan-frame');
        frame.src = './crane-plan-a3.html';
        await new Promise(r => frame.addEventListener('load', r, { once: true }));
        const w = frame.contentWindow;
        const out = w.sanitizeHtml('<img src=x onerror="parent.__planXss=1">安全<script>parent.__planXss=2</script><a href="javascript:alert(1)">x</a>');
        return { out, xss: window.__planXss || 0 };
    });
    await wait(600);
    check('計画書の取込 HTML からスクリプトが除去される',
        !/onerror|<script|javascript:/i.test(sanitized.out) && sanitized.out.includes('安全'), sanitized.out);
    check('計画書の iframe で注入スクリプトが実行されない',
        (await page.evaluate(() => window.__planXss || 0)) === 0);
    await page.evaluate(() => { document.getElementById('plan-frame').removeAttribute('src'); });

    console.log('安全チェック（吊荷位置 / 通路重複）');
    await importProject({
        version: '2.0',
        scene: { version: '1.1', objects: [
            craneItem,
            { type: 'loadPick', position: at(5, 0), rotation: 0 },
            { type: 'loadDrop', position: at(0, 5), rotation: 0 },
            // 旋回扇環（角度 0°→90°, 半径 4〜6m）の真ん中 (4,4) を横切る通路
            { type: 'path', position: at(0, 0), rotation: 0, points: [at(2, 6), at(6, 2)] },
        ] },
    });
    await wait(1200);
    check('吊荷位置：作業半径内なら OK', (await text('#safety-load')).includes('OK'), await text('#safety-load'));
    check('通路重複：旋回範囲の下を通る通路を検出', (await text('#safety-path')).includes('旋回範囲'), await text('#safety-path'));

    await importProject({
        version: '2.0',
        scene: { version: '1.1', objects: [
            craneItem,
            { type: 'loadPick', position: at(25, 0), rotation: 0 },
            { type: 'path', position: at(0, 0), rotation: 0, points: [at(-8, -8), at(-8, 8)] },
        ] },
    });
    await wait(1200);
    check('吊荷位置：作業半径外を検出', (await text('#safety-load')).includes('作業半径外'), await text('#safety-load'));
    check('通路重複：離れた通路は OK', (await text('#safety-path')).includes('OK'), await text('#safety-path'));

    console.log('リサイズ');
    await noNewErrors('ウィンドウリサイズで例外なし', async () => {
        await page.setViewport({ width: 1100, height: 700 }); await wait(500);
    });

    check('テスト全体でページエラーなし', pageErrors.length === 0, pageErrors.join(' | '));
} catch (err) {
    check('テストが最後まで実行される', false, err.stack || String(err));
} finally {
    await browser.close();
    server.close();
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
