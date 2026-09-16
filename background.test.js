const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('captcha requests use a vision model with reasoning disabled', () => {
  const source = fs.readFileSync('background.js', 'utf8');

  assert.equal((source.match(/"model": "google\/gemini-2\.5-flash-lite"/g) || []).length, 2);
  assert.equal((source.match(/"reasoning": \{ "effort": "none" \}/g) || []).length, 2);
});
