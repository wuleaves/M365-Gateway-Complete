/**
 * Protocol-only multimodal normalization for the Cloudflare-native gateway.
 *
 * This module deliberately performs no network or account access. It gives a
 * future ChatHub adapter one strict representation for OpenAI Chat and
 * Responses image parts, and prevents unsupported parts from being silently
 * discarded. Wiring these attachments into ChatHub is a separate step and
 * must not be advertised until an isolated upstream probe has passed.
 */

const MAX_CONTENT_PARTS = 256;
const MAX_IMAGES = 8;
const MAX_FILES = 4;
const MAX_AUDIO = 2;
const MAX_IMAGE_URL_CHARACTERS = 8_192;
const MAX_DATA_IMAGE_BYTES = 4 * 1_024 * 1_024;
const MAX_TOTAL_DATA_IMAGE_BYTES = 6 * 1_024 * 1_024;
const MAX_DATA_FILE_BYTES = 6 * 1_024 * 1_024;
const MAX_TOTAL_DATA_MEDIA_BYTES = 12 * 1_024 * 1_024;
// Base64 expands binary data by roughly 4/3.  Reject an obviously oversized
// data URI before the anchored regexp and per-character validator allocate or
// scan several megabytes of attacker-controlled text.
const MAX_DATA_IMAGE_BASE64_CHARACTERS = Math.ceil(MAX_DATA_IMAGE_BYTES / 3) * 4;
const MAX_DATA_IMAGE_URI_CHARACTERS = MAX_DATA_IMAGE_BASE64_CHARACTERS + 128;

const DATA_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);


export type MultimodalInputErrorCode =
  | "audio_too_large"
  | "file_too_large"
  | "image_too_large"
  | "invalid_audio"
  | "invalid_file"
  | "invalid_image"
  | "invalid_multimodal_content"
  | "too_many_images"
  | "unsupported_content_part";

export class MultimodalInputError extends Error {
  constructor(readonly code: MultimodalInputErrorCode) {
    super(code.toUpperCase());
    this.name = "MultimodalInputError";
  }
}

export interface NormalizedImageAttachment {
  type: "image";
  url: string;
  mimeType: string;
  detail: "auto" | "high" | "low";
}

export interface NormalizedFileAttachment {
  type: "file";
  url: string;
  mimeType: string;
  name: string;
}

export interface NormalizedAudioAttachment {
  type: "audio";
  url: string;
  mimeType: string;
  name: string;
}

export type NormalizedMediaAttachment = NormalizedImageAttachment | NormalizedFileAttachment | NormalizedAudioAttachment;

export interface NormalizedMultimodalContent {
  text: string;
  attachments: NormalizedMediaAttachment[];
  dataImageBytes: number;
  dataMediaBytes: number;
}

export interface NormalizedMultimodalContents {
  /** One normalized result per supplied message/input content value. */
  contents: NormalizedMultimodalContent[];
  /** Flattened attachments in original message/part order. */
  attachments: NormalizedMediaAttachment[];
  dataImageBytes: number;
  dataMediaBytes: number;
}


function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function strictBase64Bytes(value: string, maximumBytes = Number.POSITIVE_INFINITY): number | null {
  if (!value || value.length % 4 !== 0) return null;
  const maximumEncodedCharacters = Math.ceil(maximumBytes / 3) * 4;
  if (value.length > maximumEncodedCharacters) return maximumBytes + 1;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const contentEnd = value.length - padding;
  // Avoid one enormous regular expression. Multi-megabyte data URLs can make
  // some JS regexp engines exhaust their backtracking stack before the size
  // guard gets a chance to reject the image.
  for (let index = 0; index < contentEnd; index += 1) {
    const code = value.charCodeAt(index);
    const base64 = (code >= 0x41 && code <= 0x5a)
      || (code >= 0x61 && code <= 0x7a)
      || (code >= 0x30 && code <= 0x39)
      || code === 0x2b
      || code === 0x2f;
    if (!base64) return null;
  }
  for (let index = contentEnd; index < value.length; index += 1) if (value.charCodeAt(index) !== 0x3d) return null;
  return value.length / 4 * 3 - padding;
}

function privateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  // Image CDNs normally use DNS names. Reject every literal IPv6 spelling so
  // IPv4-mapped, compressed, link-local and ULA variants cannot bypass a
  // partial private-range parser.
  if (host.includes(":")) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/u.exec(host);
  if (!ipv4) return false;
  const octets = ipv4.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) return true;
  const [a, b] = octets;
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function normalizedDetail(value: unknown): "auto" | "high" | "low" {
  if (value == null || value === "") return "auto";
  if (value === "auto" || value === "high" || value === "low") return value;
  throw new MultimodalInputError("invalid_image");
}

function normalizeImageURL(value: unknown, detail: unknown): { attachment: NormalizedImageAttachment; dataBytes: number } {
  if (typeof value !== "string" || !value) {
    throw new MultimodalInputError("invalid_image");
  }
  if (value.startsWith("data:")) {
    if (value.length > MAX_DATA_IMAGE_URI_CHARACTERS) throw new MultimodalInputError("image_too_large");
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/u.exec(value);
    const mimeType = match?.[1]?.toLowerCase() ?? "";
    const bytes = match ? strictBase64Bytes(match[2], MAX_DATA_IMAGE_BYTES) : null;
    if (!DATA_IMAGE_TYPES.has(mimeType) || bytes == null || bytes === 0) {
      throw new MultimodalInputError("invalid_image");
    }
    if (bytes > MAX_DATA_IMAGE_BYTES) throw new MultimodalInputError("image_too_large");
    return {
      attachment: { type: "image", url: value, mimeType, detail: normalizedDetail(detail) },
      dataBytes: bytes,
    };
  }

  if (value.length > MAX_IMAGE_URL_CHARACTERS) throw new MultimodalInputError("invalid_image");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MultimodalInputError("invalid_image");
  }
  if (url.protocol !== "https:" || url.username || url.password || privateOrLocalHostname(url.hostname)) {
    throw new MultimodalInputError("invalid_image");
  }
  return {
    attachment: { type: "image", url: url.toString(), mimeType: "image/*", detail: normalizedDetail(detail) },
    dataBytes: 0,
  };
}

function safeAttachmentName(value: unknown, fallback: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return fallback;
  if (name.length > 255 || /[\u0000-\u001f\u007f/\\]/u.test(name)) throw new MultimodalInputError("invalid_file");
  return name;
}

function normalizeMediaURL(
  kind: "file" | "audio",
  value: unknown,
  mimeValue: unknown,
  nameValue: unknown,
): { attachment: NormalizedFileAttachment | NormalizedAudioAttachment; dataBytes: number } {
  if (typeof value !== "string" || !value) throw new MultimodalInputError(kind === "file" ? "invalid_file" : "invalid_audio");
  const mimeHint = typeof mimeValue === "string" && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/u.test(mimeValue)
    ? mimeValue.toLowerCase()
    : kind === "audio" ? "audio/*" : "application/octet-stream";
  let url = value;
  let mimeType = mimeHint;
  let bytes = 0;
  if (value.startsWith("data:")) {
    if (value.length > Math.ceil(MAX_DATA_FILE_BYTES / 3) * 4 + 256) {
      throw new MultimodalInputError(kind === "file" ? "file_too_large" : "audio_too_large");
    }
    const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/u.exec(value);
    const measured = match ? strictBase64Bytes(match[2], MAX_DATA_FILE_BYTES) : null;
    if (!match || measured == null || measured === 0) throw new MultimodalInputError(kind === "file" ? "invalid_file" : "invalid_audio");
    if (measured > MAX_DATA_FILE_BYTES) throw new MultimodalInputError(kind === "file" ? "file_too_large" : "audio_too_large");
    mimeType = match[1].toLowerCase();
    if (kind === "audio" && !mimeType.startsWith("audio/")) throw new MultimodalInputError("invalid_audio");
    bytes = measured;
  } else {
    let parsed: URL;
    try { parsed = new URL(value); } catch { throw new MultimodalInputError(kind === "file" ? "invalid_file" : "invalid_audio"); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || privateOrLocalHostname(parsed.hostname)) {
      throw new MultimodalInputError(kind === "file" ? "invalid_file" : "invalid_audio");
    }
    url = parsed.toString();
  }
  const extension = kind === "audio" ? "audio" : "attachment";
  return { attachment: { type: kind, url, mimeType, name: safeAttachmentName(nameValue, extension) }, dataBytes: bytes };
}

function filePart(raw: Record<string, unknown>): { attachment: NormalizedFileAttachment; dataBytes: number } {
  const nested = record(raw.source);
  const value = raw.file_data ?? raw.file_url ?? raw.url ?? nested?.data ?? nested?.url;
  const normalized = normalizeMediaURL("file", value, raw.mime_type ?? raw.mimeType ?? raw.content_type ?? nested?.media_type, raw.filename ?? raw.name);
  if (normalized.attachment.type !== "file") throw new MultimodalInputError("invalid_file");
  return normalized as { attachment: NormalizedFileAttachment; dataBytes: number };
}

function audioPart(raw: Record<string, unknown>): { attachment: NormalizedAudioAttachment; dataBytes: number } {
  const nested = record(raw.input_audio) ?? record(raw.source);
  let value: unknown = raw.data ?? raw.audio_url ?? raw.url ?? nested?.url ?? nested?.data;
  const format = typeof nested?.format === "string" ? nested.format.toLowerCase() : "";
  if (typeof value === "string" && value && !value.startsWith("data:") && !/^https:\/\//iu.test(value) && format) {
    const mime = format === "mp3" ? "audio/mpeg" : `audio/${format}`;
    value = `data:${mime};base64,${value}`;
  }
  const normalized = normalizeMediaURL("audio", value, raw.mime_type ?? raw.mimeType ?? raw.content_type ?? nested?.media_type, raw.filename ?? raw.name ?? "audio");
  if (normalized.attachment.type !== "audio") throw new MultimodalInputError("invalid_audio");
  return normalized as { attachment: NormalizedAudioAttachment; dataBytes: number };
}

function imagePart(raw: Record<string, unknown>): { attachment: NormalizedImageAttachment; dataBytes: number } {
  if (raw.type === "image_url") {
    if (typeof raw.image_url === "string") return normalizeImageURL(raw.image_url, raw.detail);
    const image = record(raw.image_url);
    if (!image) throw new MultimodalInputError("invalid_image");
    return normalizeImageURL(image.url, image.detail ?? raw.detail);
  }
  if (raw.type === "input_image") return normalizeImageURL(raw.image_url ?? raw.url, raw.detail);
  if (raw.type === "image") return normalizeImageURL(raw.url, raw.detail);
  throw new MultimodalInputError("unsupported_content_part");
}

/** Normalize OpenAI Chat/Responses content without fetching remote images. */
export function normalizeMultimodalContent(content: unknown): NormalizedMultimodalContent {
  if (typeof content === "string") return { text: content, attachments: [], dataImageBytes: 0, dataMediaBytes: 0 };
  if (!Array.isArray(content) || content.length > MAX_CONTENT_PARTS) {
    throw new MultimodalInputError("invalid_multimodal_content");
  }
  const text: string[] = [];
  const attachments: NormalizedMediaAttachment[] = [];
  let dataImageBytes = 0;
  let dataMediaBytes = 0;
  let fileCount = 0;
  let audioCount = 0;
  for (const value of content) {
    const part = record(value);
    if (!part || typeof part.type !== "string") throw new MultimodalInputError("invalid_multimodal_content");
    if (["text", "input_text", "output_text"].includes(part.type)) {
      if (typeof part.text !== "string") throw new MultimodalInputError("invalid_multimodal_content");
      text.push(part.text);
      continue;
    }
    if (["image_url", "input_image", "image"].includes(part.type)) {
      if (attachments.filter((attachment) => attachment.type === "image").length >= MAX_IMAGES) {
        throw new MultimodalInputError("too_many_images");
      }
      const image = imagePart(part);
      dataImageBytes += image.dataBytes;
      if (dataImageBytes > MAX_TOTAL_DATA_IMAGE_BYTES) throw new MultimodalInputError("image_too_large");
      attachments.push(image.attachment);
      continue;
    }
    if (["file", "input_file"].includes(part.type)) {
      if (fileCount >= MAX_FILES) throw new MultimodalInputError("invalid_file");
      const file = filePart(part);
      fileCount += 1;
      dataMediaBytes += file.dataBytes;
      if (dataMediaBytes > MAX_TOTAL_DATA_MEDIA_BYTES) throw new MultimodalInputError("file_too_large");
      attachments.push(file.attachment);
      continue;
    }
    if (["audio", "input_audio"].includes(part.type)) {
      if (audioCount >= MAX_AUDIO) throw new MultimodalInputError("invalid_audio");
      const audio = audioPart(part);
      audioCount += 1;
      dataMediaBytes += audio.dataBytes;
      if (dataMediaBytes > MAX_TOTAL_DATA_MEDIA_BYTES) throw new MultimodalInputError("audio_too_large");
      attachments.push(audio.attachment);
      continue;
    }
    throw new MultimodalInputError("unsupported_content_part");
  }
  return { text: text.join("\n"), attachments, dataImageBytes, dataMediaBytes };
}

/**
 * Normalize all message content fields as one request budget. Calling the
 * single-content helper independently for every message would otherwise let a
 * request multiply the eight-image and six-MiB limits by its message count.
 */
export function normalizeMultimodalContents(values: readonly unknown[]): NormalizedMultimodalContents {
  if (!Array.isArray(values)) throw new MultimodalInputError("invalid_multimodal_content");
  const contents: NormalizedMultimodalContent[] = [];
  const attachments: NormalizedMediaAttachment[] = [];
  let dataImageBytes = 0;
  let dataMediaBytes = 0;
  let fileCount = 0;
  let audioCount = 0;
  for (const value of values) {
    const normalized = normalizeMultimodalContent(value);
    const images = attachments.filter((attachment) => attachment.type === "image").length
      + normalized.attachments.filter((attachment) => attachment.type === "image").length;
    if (images > MAX_IMAGES) {
      throw new MultimodalInputError("too_many_images");
    }
    fileCount += normalized.attachments.filter((attachment) => attachment.type === "file").length;
    audioCount += normalized.attachments.filter((attachment) => attachment.type === "audio").length;
    if (fileCount > MAX_FILES) throw new MultimodalInputError("invalid_file");
    if (audioCount > MAX_AUDIO) throw new MultimodalInputError("invalid_audio");
    dataImageBytes += normalized.dataImageBytes;
    if (dataImageBytes > MAX_TOTAL_DATA_IMAGE_BYTES) throw new MultimodalInputError("image_too_large");
    dataMediaBytes += normalized.dataMediaBytes;
    if (dataMediaBytes > MAX_TOTAL_DATA_MEDIA_BYTES) throw new MultimodalInputError("file_too_large");
    contents.push(normalized);
    attachments.push(...normalized.attachments);
  }
  return { contents, attachments, dataImageBytes, dataMediaBytes };
}

function probableImageURL(value: string): boolean {
  if (value.startsWith("data:")) {
    try {
      normalizeImageURL(value, "auto");
      return true;
    } catch {
      return false;
    }
  }
  let url: URL;
  try {
    normalizeImageURL(value, "auto");
    url = new URL(value);
  } catch {
    return false;
  }
  const path = url.pathname.toLowerCase();
  return path.includes("image") || /\.(?:gif|jpe?g|png|webp)$/u.test(path);
}

/**
 * Extract bounded, de-duplicated image resources from opaque ChatHub events.
 * Arbitrary links in assistant prose are intentionally not treated as images.
 */
export function extractUpstreamImageURLs(value: unknown): string[] {
  const output: string[] = [];
  const seen = new Set<string>();
  let visited = 0;
  const visit = (item: unknown, depth: number): void => {
    if (depth > 12 || visited >= 10_000 || output.length >= 4) return;
    visited += 1;
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1);
      return;
    }
    const object = record(item);
    if (!object) return;
    for (const [key, child] of Object.entries(object)) {
      if (typeof child === "string"
        && ["downloadurl", "imageurl", "src", "thumbnailurl", "url"].includes(key.toLowerCase())
        && probableImageURL(child)
        && !seen.has(child)) {
        seen.add(child);
        output.push(child);
        if (output.length >= 4) return;
      } else if (typeof child === "object" && child !== null) {
        visit(child, depth + 1);
      }
    }
  };
  visit(value, 0);
  return output;
}
