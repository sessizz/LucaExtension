const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PROVIDERS, resolveSettings, buildChatRequest, validateSettings, resolveCaptchaOptions } = require('./providers.js');

const IMAGE = 'data:image/png;base64,AAAA';

test('OpenRouter is the default and keeps the vision model with reasoning disabled', () => {
  const settings = resolveSettings({ openrouter_api_key: 'sk-or-old' });
  assert.equal(settings.providerId, 'openrouter');
  assert.equal(settings.apiKey, 'sk-or-old');

  const { url, init } = buildChatRequest(settings, IMAGE);
  const body = JSON.parse(init.body);
  assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer sk-or-old');
  assert.equal(body.model, 'google/gemini-2.5-flash-lite');
  assert.deepEqual(body.reasoning, { effort: 'none' });
  assert.equal(body.messages[0].content[1].image_url.url, IMAGE);
});

test('OpenAI requests use max_completion_tokens and no OpenRouter fields', () => {
  const settings = resolveSettings({ ai_provider: 'openai', ai_api_key: 'sk-test' });
  const { url, init } = buildChatRequest(settings, IMAGE);
  const body = JSON.parse(init.body);
  assert.equal(url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(body.model, PROVIDERS.openai.model);
  assert.equal(body.max_completion_tokens, 20);
  assert.equal(body.reasoning, undefined);
  assert.equal(init.headers['X-Title'], undefined);
});

test('custom provider trims trailing slash and works without an API key', () => {
  const settings = resolveSettings({ ai_provider: 'custom', ai_base_url: 'http://localhost:11434/v1/', ai_model: 'llava' });
  assert.equal(validateSettings(settings), null);

  const { url, init } = buildChatRequest(settings, IMAGE);
  assert.equal(url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(init.headers.Authorization, undefined);
});

test('validation catches missing fields', () => {
  assert.match(validateSettings(resolveSettings({ ai_provider: 'custom', ai_model: 'x' })), /Base URL/);
  assert.match(validateSettings(resolveSettings({ ai_provider: 'custom', ai_base_url: 'ftp://x', ai_model: 'x' })), /http/);
  assert.match(validateSettings(resolveSettings({ ai_provider: 'openai' })), /anahtari/);
});

test('background.js loads providers.js and has a single request path', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /importScripts\("providers\.js"\)/);
  assert.equal((source.match(/fetch\(url, init\)/g) || []).length, 1);
  assert.doesNotMatch(source, /openrouter\.ai/);
});

test('empty captcha answers are flagged so content.js can reload for a new captcha', () => {
  const source = fs.readFileSync('background.js', 'utf8');
  assert.match(source, /error\.code = "EMPTY_RESPONSE"/);
  assert.match(source, /sendResponse\(\{ success: false, error: [^}]*code: error\.code \}\)/);
  const content = fs.readFileSync('content.js', 'utf8');
  assert.match(content, /response\.code === "EMPTY_RESPONSE"/);
});

test('captcha options default to on and can be switched off', () => {
  assert.deepEqual(resolveCaptchaOptions({}), { reloadOnEmpty: true, autoSubmit: true });
  assert.deepEqual(
    resolveCaptchaOptions({ captcha_reload_on_empty: false, captcha_auto_submit: false }),
    { reloadOnEmpty: false, autoSubmit: false }
  );
  assert.deepEqual(
    resolveCaptchaOptions({ captcha_reload_on_empty: true, captcha_auto_submit: false }),
    { reloadOnEmpty: true, autoSubmit: false }
  );
});

test('content script loads providers.js before content.js', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const js = manifest.content_scripts[0].js;
  assert.ok(js.indexOf('providers.js') !== -1 && js.indexOf('providers.js') < js.indexOf('content.js'));
});

test('luca-home.js runs on www.luca.com.tr and reads login URLs from popup()/window.open()', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const entry = manifest.content_scripts.find((item) => item.js.includes('luca-home.js'));
  assert.ok(entry && entry.matches.includes('https://www.luca.com.tr/*'));
  const source = fs.readFileSync('luca-home.js', 'utf8');
  const pattern = new RegExp(source.match(/LOGIN_OPENER_PATTERN = \/(.+)\/;/)[1]);
  assert.equal("popup('https://agiris.luca.com.tr/TicariSSO/giris.erp')".match(pattern)[1], 'https://agiris.luca.com.tr/TicariSSO/giris.erp');
  assert.equal("MyWindow=window.open('https://agiris.luca.com.tr/LUCASSO/giris.erp','MyWindow',width=720,height=390); return false;".match(pattern)[1], 'https://agiris.luca.com.tr/LUCASSO/giris.erp');
});

test('luca-main-world.js runs in the page world at document_start on agiris', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  const entry = manifest.content_scripts.find((item) => item.js.includes('luca-main-world.js'));
  assert.ok(entry);
  assert.equal(entry.world, 'MAIN');
  assert.equal(entry.run_at, 'document_start');
  assert.ok(entry.matches.includes('https://agiris.luca.com.tr/*'));
});

test('all automatic clicks wait AUTO_CLICK_DELAY_MS (1 s)', () => {
  const source = fs.readFileSync('content.js', 'utf8');
  assert.match(source, /const AUTO_CLICK_DELAY_MS = 1000;/);
  assert.equal((source.match(/setTimeout\([^;]*AUTO_CLICK_DELAY_MS\)/g) || []).length, 4);
  assert.doesNotMatch(source, /\.click\(\), \d+\)/);
});
