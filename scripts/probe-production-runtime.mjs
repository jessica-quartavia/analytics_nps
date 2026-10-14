/**
 * One-off production runtime probe (console + page-content).
 */
import puppeteer from 'puppeteer';

const URL = process.argv[2] ?? 'https://analyticsnps.vercel.app/#/executivo';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

page.on('pageerror', (e) => {
  errors.push({ kind: 'pageerror', message: e.message, stack: e.stack });
});
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    errors.push({ kind: 'console', text: msg.text() });
  }
});
page.on('response', (res) => {
  const u = res.url();
  const status = res.status();
  if (status >= 400) {
    errors.push({
      kind: 'http_error',
      url: u,
      status,
      contentType: res.headers()['content-type'] ?? '',
    });
  }
});
page.on('requestfailed', (req) => {
  errors.push({
    kind: 'requestfailed',
    url: req.url(),
    failure: req.failure()?.errorText,
  });
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise((r) => setTimeout(r, 4000));

const content = await page.evaluate(() => ({
  innerTextLen: document.getElementById('page-content')?.innerText?.trim()?.length ?? 0,
  innerHTMLLen: document.getElementById('page-content')?.innerHTML?.length ?? 0,
  snippet: document.getElementById('page-content')?.innerHTML?.slice(0, 600),
  topbar: document.getElementById('topbar-title')?.textContent,
  filtersVisible: document.getElementById('filters-bar')?.innerHTML?.length ?? 0,
}));

console.log(JSON.stringify({ url: URL, content, events: errors }, null, 2));
await browser.close();
