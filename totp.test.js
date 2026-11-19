const test = require('node:test');
const assert = require('node:assert/strict');
const {
  base32Decode,
  base32Encode,
  parseOtpauthUri,
  parseMigrationUri,
  parseQrText,
  generateTotp,
  otpRemainingSeconds,
  otpWaitMs,
  otpLabel
} = require('./totp.js');

const ascii = (s) => new TextEncoder().encode(s);

// RFC 6238 Appendix B secrets
const SHA1_SECRET = base32Encode(ascii('12345678901234567890'));
const SHA256_SECRET = base32Encode(ascii('12345678901234567890123456789012'));
const SHA512_SECRET = base32Encode(ascii('1234567890123456789012345678901234567890123456789012345678901234'));

test('base32 round trip and RFC 4648 vector', () => {
  assert.equal(base32Encode(ascii('foobar')), 'MZXW6YTBOI');
  assert.deepEqual(Array.from(base32Decode('MZXW6YTBOI======')), Array.from(ascii('foobar')));
  // lower case and spaces as printed by many sites
  assert.deepEqual(Array.from(base32Decode('mzxw 6ytb oi')), Array.from(ascii('foobar')));
  assert.equal(SHA1_SECRET, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
});

test('base32 rejects invalid characters', () => {
  assert.throws(() => base32Decode('ABC1'), /gecersiz/i);
  assert.throws(() => base32Decode(''), /bos/i);
});

test('RFC 6238 vectors (SHA1, SHA256, SHA512, 8 digits)', async () => {
  const cases = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826']
  ];
  for (const [t, sha1, sha256, sha512] of cases) {
    const ms = t * 1000;
    assert.equal(await generateTotp({ secret: SHA1_SECRET, algorithm: 'SHA1', digits: 8, period: 30 }, ms), sha1);
    assert.equal(await generateTotp({ secret: SHA256_SECRET, algorithm: 'SHA256', digits: 8, period: 30 }, ms), sha256);
    assert.equal(await generateTotp({ secret: SHA512_SECRET, algorithm: 'SHA512', digits: 8, period: 30 }, ms), sha512);
  }
});

test('defaults are SHA1 / 6 digits / 30 s and codes keep leading zeros', async () => {
  // 07081804 -> last 6 digits 081804
  assert.equal(await generateTotp({ secret: SHA1_SECRET }, 1111111109 * 1000), '081804');
});

test('remaining seconds and wait before a fresh code', () => {
  const otp = { period: 30 };
  assert.equal(otpRemainingSeconds(otp, 0), 30);
  assert.equal(otpRemainingSeconds(otp, 29_000), 1);
  assert.equal(otpRemainingSeconds(otp, 29_999), 1);
  assert.equal(otpRemainingSeconds(otp, 30_000), 30);
  // more than 5 s left: no wait
  assert.equal(otpWaitMs(otp, 24_000), 0);
  // 4 s left: wait for the next code
  assert.equal(otpWaitMs(otp, 26_000), 4_000 + 250);
  // 2.5 s left: wait until the next period (+ small margin)
  assert.equal(otpWaitMs(otp, 27_500), 2_500 + 250);
});

test('parseOtpauthUri reads label, issuer and parameters', () => {
  const otp = parseOtpauthUri('otpauth://totp/Luca%20Net:ali%40ornek.com?secret=jbsw y3dp ehpk 3pxp&issuer=Luca%20Net&digits=6&period=30');
  assert.deepEqual(otp, {
    secret: 'JBSWY3DPEHPK3PXP',
    issuer: 'Luca Net',
    account: 'ali@ornek.com',
    algorithm: 'SHA1',
    digits: 6,
    period: 30
  });
});

test('parseOtpauthUri handles label without issuer and non-default algorithm', () => {
  const otp = parseOtpauthUri('otpauth://totp/kullanici?secret=JBSWY3DPEHPK3PXP&algorithm=sha256&digits=8&period=60');
  assert.equal(otp.issuer, '');
  assert.equal(otp.account, 'kullanici');
  assert.equal(otp.algorithm, 'SHA256');
  assert.equal(otp.digits, 8);
  assert.equal(otp.period, 60);
});

test('parseOtpauthUri rejects HOTP, missing secret and unsupported algorithms', () => {
  assert.throws(() => parseOtpauthUri('otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP&counter=1'), /zaman tabanli/i);
  assert.throws(() => parseOtpauthUri('otpauth://totp/x?issuer=a'), /secret/i);
  assert.throws(() => parseOtpauthUri('otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&algorithm=MD5'), /algoritma/i);
});

// --- minimal protobuf encoder, only for building test payloads ---
function varint(n) {
  const out = [];
  while (n > 127) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
  return out;
}
function field(no, wire, payload) {
  const key = varint(no * 8 + wire);
  if (wire === 0) return [...key, ...varint(payload)];
  return [...key, ...varint(payload.length), ...payload];
}
function otpParams({ secret, name, issuer, algorithm = 1, digits = 1, type = 2 }) {
  return [
    ...field(1, 2, Array.from(secret)),
    ...field(2, 2, Array.from(ascii(name))),
    ...field(3, 2, Array.from(ascii(issuer))),
    ...field(4, 0, algorithm),
    ...field(5, 0, digits),
    ...field(6, 0, type)
  ];
}
function migrationUri(entries, { encode = true } = {}) {
  const bytes = [
    ...entries.flatMap((e) => field(1, 2, otpParams(e))),
    ...field(2, 0, 1),        // version
    ...field(3, 0, 1),        // batch_size
    ...field(4, 0, 0),        // batch_index
    ...field(5, 0, 123456789) // batch_id
  ];
  const b64 = Buffer.from(bytes).toString('base64');
  return 'otpauth-migration://offline?data=' + (encode ? encodeURIComponent(b64) : b64);
}

test('parseMigrationUri decodes Google Authenticator export with several accounts', () => {
  const uri = migrationUri([
    { secret: ascii('12345678901234567890'), name: 'firma-a', issuer: 'Luca' },
    { secret: ascii('abcdefghij'), name: 'ali@gmail.com', issuer: 'Google', algorithm: 2, digits: 2 }
  ]);
  const entries = parseMigrationUri(uri);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    secret: SHA1_SECRET, issuer: 'Luca', account: 'firma-a', algorithm: 'SHA1', digits: 6, period: 30
  });
  assert.equal(entries[1].issuer, 'Google');
  assert.equal(entries[1].algorithm, 'SHA256');
  assert.equal(entries[1].digits, 8);
  assert.equal(entries[1].secret, base32Encode(ascii('abcdefghij')));
});

test('parseMigrationUri decodes a real Google Authenticator export sample', () => {
  const [entry] = parseMigrationUri('otpauth-migration://offline?data=CjEKCkhlbGxvId6tvu8SGEV4YW1wbGU6YWxpY2VAZ29vZ2xlLmNvbRoHRXhhbXBsZTAC');
  assert.deepEqual(entry, {
    secret: 'JBSWY3DPEHPK3PXP', issuer: 'Example', account: 'alice@google.com', algorithm: 'SHA1', digits: 6, period: 30
  });
});

test('parseMigrationUri strips "Issuer:" prefix from name and tolerates raw + in data', () => {
  // find a payload whose base64 contains "+" so the raw (non-encoded) form is exercised
  let uri;
  // 0xfb 0xef 0xbe encodes to "++++" when it lands on a 3-byte boundary; shift it with padding
  for (let i = 0; i < 3 && !uri; i++) {
    const secret = Uint8Array.from([...Array(i).fill(0x41), 0xfb, 0xef, 0xbe, 0xfb, 0xef, 0xbe, 1, 2, 3, 4]);
    const candidate = migrationUri([{ secret, name: 'Luca:firma-b', issuer: 'Luca' }], { encode: false });
    if (candidate.includes('+')) uri = candidate;
  }
  assert.ok(uri, 'test payload with + not found');
  const [entry] = parseMigrationUri(uri);
  assert.equal(entry.account, 'firma-b');
  assert.equal(entry.issuer, 'Luca');
});

test('parseMigrationUri skips HOTP entries and fails when nothing usable remains', () => {
  const mixed = migrationUri([
    { secret: ascii('12345678901234567890'), name: 'sayac', issuer: 'X', type: 1 },
    { secret: ascii('12345678901234567890'), name: 'zaman', issuer: 'Y', type: 2 }
  ]);
  const entries = parseMigrationUri(mixed);
  assert.deepEqual(entries.map((e) => e.account), ['zaman']);

  const onlyHotp = migrationUri([{ secret: ascii('12345678901234567890'), name: 'sayac', issuer: 'X', type: 1 }]);
  assert.throws(() => parseMigrationUri(onlyHotp), /zaman tabanli/i);
  assert.throws(() => parseMigrationUri('otpauth-migration://offline?data=%%%'), /okunamadi/i);
});

test('parseQrText dispatches on scheme and rejects other QR contents', () => {
  assert.equal(parseQrText('otpauth://totp/a?secret=JBSWY3DPEHPK3PXP').length, 1);
  assert.equal(parseQrText(migrationUri([{ secret: ascii('12345678901234567890'), name: 'a', issuer: 'b' }])).length, 1);
  assert.throws(() => parseQrText('https://ornek.com'), /2FA QR/);
});

test('otpLabel prefers "issuer (account)"', () => {
  assert.equal(otpLabel({ issuer: 'Luca', account: 'firma' }), 'Luca (firma)');
  assert.equal(otpLabel({ issuer: '', account: 'firma' }), 'firma');
  assert.equal(otpLabel({ issuer: 'Luca', account: '' }), 'Luca');
});
