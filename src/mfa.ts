const textEncoder = new TextEncoder();

function b64u(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeBase32(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replaceAll("=", "").replaceAll(/\s+/gu, "");
  let buffer = 0;
  let bits = 0;
  const output: number[] = [];
  for (const character of clean) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("INVALID_TOTP_SECRET");
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(output);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, message));
}

export async function verifyTOTP(secret: string, code: string, now = Date.now()): Promise<boolean> {
  if (!/^[0-9]{6}$/u.test(code.trim())) return false;
  const key = decodeBase32(secret);
  const counter = Math.floor(now / 30_000);
  for (let offset = -1; offset <= 1; offset += 1) {
    const message = new Uint8Array(8);
    let value = counter + offset;
    for (let index = 7; index >= 0; index -= 1) {
      message[index] = value & 0xff;
      value = Math.floor(value / 256);
    }
    const digest = await hmacSha1(key, message);
    const position = digest[digest.length - 1] & 0x0f;
    const number = ((digest[position] & 0x7f) << 24)
      | (digest[position + 1] << 16)
      | (digest[position + 2] << 8)
      | digest[position + 3];
    const expected = String(number % 1_000_000).padStart(6, "0");
    if (constantTimeEqual(textEncoder.encode(expected), textEncoder.encode(code.trim()))) return true;
  }
  return false;
}

export function randomChallenge(size = 32): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return b64u(bytes);
}

type CborValue = number | Uint8Array | string | CborValue[] | Map<number | string, CborValue> | boolean | null;

function readCbor(bytes: Uint8Array, offset = 0): { value: CborValue; offset: number } {
  const first = bytes[offset++];
  const major = first >> 5;
  const additional = first & 0x1f;
  const readLength = (): number => {
    if (additional < 24) return additional;
    const width = 2 ** (additional - 24);
    let result = 0;
    for (let index = 0; index < width; index += 1) result = result * 256 + bytes[offset++];
    return result;
  };
  if (major === 0) return { value: readLength(), offset };
  if (major === 1) return { value: -1 - readLength(), offset };
  if (major === 2) {
    const length = readLength();
    const value = bytes.slice(offset, offset + length);
    return { value, offset: offset + length };
  }
  if (major === 3) {
    const length = readLength();
    const value = new TextDecoder().decode(bytes.slice(offset, offset + length));
    return { value, offset: offset + length };
  }
  if (major === 4) {
    const values: CborValue[] = [];
    for (let index = 0, length = readLength(); index < length; index += 1) {
      const result = readCbor(bytes, offset);
      values.push(result.value);
      offset = result.offset;
    }
    return { value: values, offset };
  }
  if (major === 5) {
    const map = new Map<number | string, CborValue>();
    for (let index = 0, length = readLength(); index < length; index += 1) {
      const key = readCbor(bytes, offset);
      offset = key.offset;
      const value = readCbor(bytes, offset);
      offset = value.offset;
      if (typeof key.value === "number" || typeof key.value === "string") map.set(key.value, value.value);
    }
    return { value: map, offset };
  }
  if (major === 7 && additional === 20) return { value: false, offset };
  if (major === 7 && additional === 21) return { value: true, offset };
  if (major === 7 && additional === 22) return { value: null, offset };
  throw new Error("UNSUPPORTED_CBOR");
}

function bytesFrom(value: CborValue | undefined): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new Error("INVALID_WEBAUTHN_KEY");
  return value;
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", value));
}

function concat(...values: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) { result.set(value, offset); offset += value.length; }
  return result;
}

function derToRawSignature(signature: Uint8Array): Uint8Array {
  if (signature[0] !== 0x30) throw new Error("INVALID_WEBAUTHN_SIGNATURE");
  let offset = 2;
  if (signature[1] & 0x80) offset += (signature[1] & 0x7f);
  if (signature[offset++] !== 0x02) throw new Error("INVALID_WEBAUTHN_SIGNATURE");
  const rLength = signature[offset++];
  const r = signature.slice(offset, offset + rLength); offset += rLength;
  if (signature[offset++] !== 0x02) throw new Error("INVALID_WEBAUTHN_SIGNATURE");
  const sLength = signature[offset++];
  const s = signature.slice(offset, offset + sLength);
  const raw = new Uint8Array(64);
  raw.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length));
  raw.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length));
  return raw;
}

function validOrigin(clientData: Record<string, unknown>, expectedChallenge: string, origin: string, type: string): boolean {
  return clientData.type === type && clientData.challenge === expectedChallenge && clientData.origin === origin;
}

export async function verifyPasskeyAssertion(input: {
  credentialId: string;
  publicKey: JsonWebKey;
  expectedChallenge: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  origin: string;
  rpId: string;
}): Promise<{ signCount: number }> {
  const clientData = JSON.parse(new TextDecoder().decode(decodeBase64Url(input.clientDataJSON))) as Record<string, unknown>;
  if (!validOrigin(clientData, input.expectedChallenge, input.origin, "webauthn.get")) throw new Error("INVALID_WEBAUTHN_CLIENT_DATA");
  const authData = decodeBase64Url(input.authenticatorData);
  if (authData.length < 37 || (authData[32] & 0x01) === 0 || (authData[32] & 0x04) === 0) throw new Error("USER_VERIFICATION_REQUIRED");
  const rpHash = await sha256(textEncoder.encode(input.rpId));
  if (!constantTimeEqual(authData.slice(0, 32), rpHash)) throw new Error("INVALID_WEBAUTHN_RP_ID");
  const clientHash = await sha256(decodeBase64Url(input.clientDataJSON));
  const signature = derToRawSignature(decodeBase64Url(input.signature));
  const key = await crypto.subtle.importKey("jwk", input.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, concat(authData, clientHash));
  if (!valid) throw new Error("INVALID_WEBAUTHN_SIGNATURE");
  return { signCount: new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0) };
}

export async function parsePasskeyRegistration(input: {
  credentialId: string;
  attestationObject: string;
  clientDataJSON: string;
  expectedChallenge: string;
  origin: string;
  rpId: string;
}): Promise<{ id: string; publicKey: JsonWebKey; signCount: number }> {
  const clientData = JSON.parse(new TextDecoder().decode(decodeBase64Url(input.clientDataJSON))) as Record<string, unknown>;
  if (!validOrigin(clientData, input.expectedChallenge, input.origin, "webauthn.create")) throw new Error("INVALID_WEBAUTHN_CLIENT_DATA");
  const attestation = readCbor(decodeBase64Url(input.attestationObject)).value;
  if (!(attestation instanceof Map)) throw new Error("INVALID_WEBAUTHN_ATTESTATION");
  const authData = bytesFrom(attestation.get("authData"));
  if (authData.length < 55 || (authData[32] & 0x01) === 0 || (authData[32] & 0x04) === 0) throw new Error("USER_VERIFICATION_REQUIRED");
  const rpHash = await sha256(textEncoder.encode(input.rpId));
  if (!constantTimeEqual(authData.slice(0, 32), rpHash)) throw new Error("INVALID_WEBAUTHN_RP_ID");
  const credentialLength = new DataView(authData.buffer, authData.byteOffset + 53, 2).getUint16(0);
  const credentialId = authData.slice(55, 55 + credentialLength);
  if (b64u(credentialId) !== input.credentialId) throw new Error("INVALID_WEBAUTHN_CREDENTIAL");
  const cose = readCbor(authData, 55 + credentialLength).value;
  if (!(cose instanceof Map) || cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) throw new Error("UNSUPPORTED_WEBAUTHN_KEY");
  const publicKey: JsonWebKey = { kty: "EC", crv: "P-256", x: b64u(bytesFrom(cose.get(-2))), y: b64u(bytesFrom(cose.get(-3))), ext: true };
  return { id: input.credentialId, publicKey, signCount: new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(0) };
}
