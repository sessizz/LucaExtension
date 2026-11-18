const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PROVIDERS, resolveSettings, buildChatRequest, validateSettings } = require('./providers.js');

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
