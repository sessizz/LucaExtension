// Iki asamali dogrulama (TOTP, RFC 6238) yardimcilari.
// popup.js (<script>), content.js (content_scripts) ve testler (require) tarafindan kullanilir.
// Ag istegi yapmaz; kodlar Web Crypto ile yerelde hesaplanir.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const OTP_ALGORITHMS = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };
// Kodun bitmesine bu kadar sure kala yazmak yerine yeni kod beklenir.
const OTP_MIN_REMAINING_MS = 3000;
const OTP_WAIT_MARGIN_MS = 250;

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function normalizeBase32(input) {
  return String(input || "").toUpperCase().replace(/[\s=-]/g, "");
}

function base32Decode(input) {
  const clean = normalizeBase32(input);
  if (!clean) throw new Error("2FA anahtari bos.");

  const bytes = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`2FA anahtarinda gecersiz karakter: "${char}"`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

function normalizeAlgorithm(name) {
  const key = String(name || "SHA1").toUpperCase().replace(/-/g, "");
  if (!OTP_ALGORITHMS[key]) throw new Error(`Desteklenmeyen algoritma: ${name}`);
  return key;
}

function makeOtp({ secret, issuer, account, algorithm, digits, period }) {
  const cleanSecret = normalizeBase32(secret);
  base32Decode(cleanSecret); // gecerlilik kontrolu
  const digitCount = Number(digits) || 6;
  if (digitCount !== 6 && digitCount !== 8) throw new Error(`Desteklenmeyen hane sayisi: ${digits}`);
  const seconds = Number(period) || 30;
  if (!(seconds > 0)) throw new Error(`Gecersiz periyot: ${period}`);

  return {
    secret: cleanSecret,
    issuer: String(issuer || "").trim(),
    account: String(account || "").trim(),
    algorithm: normalizeAlgorithm(algorithm),
    digits: digitCount,
    period: seconds
  };
}

// "Issuer:hesap" etiketini parcalar; issuer parametresi varsa o onceliklidir.
function splitLabel(label, issuerParam) {
  const text = String(label || "").trim();
  const colon = text.indexOf(":");
  if (colon === -1) return { issuer: issuerParam || "", account: text };
  return {
    issuer: issuerParam || text.slice(0, colon).trim(),
    account: text.slice(colon + 1).trim()
  };
}

function parseOtpauthUri(uri) {
  let url;
  try {
    url = new URL(String(uri).trim());
  } catch (e) {
    throw new Error("QR icerigi okunamadi.");
  }
  if (url.protocol !== "otpauth:") throw new Error("Bu bir 2FA QR kodu degil.");
  if (url.host.toLowerCase() !== "totp") {
    throw new Error("Sadece zaman tabanli (TOTP) kodlar desteklenir.");
  }

  const params = url.searchParams;
  const secret = params.get("secret");
  if (!secret) throw new Error("QR icinde secret (anahtar) yok.");

  let label = url.pathname.replace(/^\/+/, "");
  try {
    label = decodeURIComponent(label);
  } catch (e) {
    // bozuk kodlama: etiketi oldugu gibi kullan
  }
  const { issuer, account } = splitLabel(label, params.get("issuer"));

  return makeOtp({
    secret,
    issuer,
    account,
    algorithm: params.get("algorithm") || "SHA1",
    digits: params.get("digits") || 6,
    period: params.get("period") || 30
  });
}

// --- Google Authenticator "Hesaplari aktar" (otpauth-migration) ---

function base64ToBytes(text) {
  const normalized = text.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Basit protobuf okuyucu: alan no -> [deger...] (varint: Number, length-delimited: Uint8Array)
function readProtobuf(bytes) {
  const fields = {};
  let pos = 0;

  function readVarint() {
    let result = 0;
    let multiplier = 1;
    for (;;) {
      if (pos >= bytes.length) throw new Error("protobuf: beklenmeyen son");
      const byte = bytes[pos++];
      result += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) return result;
      multiplier *= 128;
    }
  }

  while (pos < bytes.length) {
    const key = readVarint();
    const fieldNo = Math.floor(key / 8);
    const wireType = key % 8;
    let value;
    if (wireType === 0) {
      value = readVarint();
    } else if (wireType === 2) {
      const length = readVarint();
      if (pos + length > bytes.length) throw new Error("protobuf: alan tasti");
      value = bytes.subarray(pos, pos + length);
      pos += length;
    } else if (wireType === 1) {
      pos += 8;
      continue;
    } else if (wireType === 5) {
      pos += 4;
      continue;
    } else {
      throw new Error(`protobuf: bilinmeyen tip ${wireType}`);
    }
    (fields[fieldNo] = fields[fieldNo] || []).push(value);
  }
  if (pos > bytes.length) throw new Error("protobuf: beklenmeyen son");
  return fields;
}

const MIGRATION_ALGORITHMS = { 0: "SHA1", 1: "SHA1", 2: "SHA256", 3: "SHA512" };
const MIGRATION_DIGITS = { 0: 6, 1: 6, 2: 8 };
const MIGRATION_TYPE_TOTP = 2;

function parseMigrationUri(uri) {
  const text = String(uri).trim();
  const match = text.match(/[?&]data=([^&]*)/);
  let fields;
  try {
    if (!match) throw new Error("data yok");
    const payload = base64ToBytes(decodeURIComponent(match[1]));
    fields = readProtobuf(payload);
  } catch (e) {
    throw new Error("Google Authenticator aktarma QR'i okunamadi.");
  }

  const decoder = new TextDecoder();
  const entries = [];
  let skipped = 0;
  for (const raw of fields[1] || []) {
    const p = readProtobuf(raw);
    const type = (p[6] || [MIGRATION_TYPE_TOTP])[0];
    const algorithm = MIGRATION_ALGORITHMS[(p[4] || [0])[0]];
    if (type !== MIGRATION_TYPE_TOTP || !algorithm) {
      skipped++;
      continue;
    }
    const secret = p[1] ? p[1][0] : new Uint8Array();
    if (!secret.length) {
      skipped++;
      continue;
    }
    const issuer = p[3] ? decoder.decode(p[3][0]) : "";
    const name = p[2] ? decoder.decode(p[2][0]) : "";
    const label = splitLabel(name, issuer);
    entries.push(makeOtp({
      secret: base32Encode(secret),
      issuer: label.issuer,
      account: label.account,
      algorithm,
      digits: MIGRATION_DIGITS[(p[5] || [0])[0]] || 6,
      period: 30
    }));
  }

  if (!entries.length) {
    throw new Error(skipped
      ? "Aktarma QR'inda zaman tabanli (TOTP) hesap yok."
      : "Aktarma QR'inda hesap bulunamadi.");
  }
  return entries;
}

// QR'dan okunan metni bir veya daha fazla 2FA kaydina cevirir.
function parseQrText(text) {
  const value = String(text || "").trim();
  if (/^otpauth-migration:/i.test(value)) return parseMigrationUri(value);
  if (/^otpauth:/i.test(value)) return [parseOtpauthUri(value)];
  throw new Error("Bu bir 2FA QR kodu degil.");
}

function otpLabel(otp) {
  if (otp.issuer && otp.account) return `${otp.issuer} (${otp.account})`;
  return otp.issuer || otp.account || "2FA";
}

function otpPeriodMs(otp) {
  return (Number(otp.period) || 30) * 1000;
}

function otpRemainingSeconds(otp, nowMs) {
  const periodMs = otpPeriodMs(otp);
  return Math.ceil((periodMs - (nowMs % periodMs)) / 1000);
}

// Kodun bitmesine cok az kaldiysa bir sonraki koda kadar beklenecek sure (ms), yoksa 0.
function otpWaitMs(otp, nowMs) {
  const periodMs = otpPeriodMs(otp);
  const remaining = periodMs - (nowMs % periodMs);
  return remaining < OTP_MIN_REMAINING_MS ? remaining + OTP_WAIT_MARGIN_MS : 0;
}

async function generateTotp(otp, nowMs) {
  const algorithm = normalizeAlgorithm(otp.algorithm);
  const digits = Number(otp.digits) || 6;
  const counter = Math.floor(nowMs / otpPeriodMs(otp));

  const message = new Uint8Array(8);
  let rest = counter;
  for (let i = 7; i >= 0; i--) {
    message[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(otp.secret),
    { name: "HMAC", hash: OTP_ALGORITHMS[algorithm] },
    false,
    ["sign"]
  );
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];

  return String(binary % 10 ** digits).padStart(digits, "0");
}

if (typeof module !== "undefined") {
  module.exports = {
    base32Encode,
    base32Decode,
    parseOtpauthUri,
    parseMigrationUri,
    parseQrText,
    otpLabel,
    otpRemainingSeconds,
    otpWaitMs,
    generateTotp
  };
}
