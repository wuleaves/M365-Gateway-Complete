import { describe, expect, it } from "vitest";
import { chatHubAttachments, chatPayload } from "../src/chathub";
import { MultimodalInputError, normalizeMultimodalContents } from "../src/multimodal";
import { prepareChatMultimodal, prepareResponsesMultimodal } from "../src/openai";

describe("portable file and audio attachments", () => {
  it("normalizes Chat file/audio parts without copying their data into durable text", () => {
    const prepared = prepareChatMultimodal([{ role: "user", content: [
      { type: "text", text: "Summarize both attachments." },
      { type: "file", file_data: "data:text/plain;base64,aGVsbG8=", filename: "notes.txt", mime_type: "text/plain" },
      { type: "input_audio", input_audio: { data: "SUQzBA==", format: "mp3" }, filename: "brief.mp3" },
    ] }]);
    expect(prepared.attachments.map((item) => item.type)).toEqual(["file", "audio"]);
    expect(String(prepared.value[0].content)).toContain("[MEDIA ATTACHMENTS PRESENT] (2)");
    expect(JSON.stringify(prepared.value)).not.toContain("aGVsbG8=");
    expect(JSON.stringify(prepared.value)).not.toContain("SUQzBA==");
  });

  it("preserves generic media metadata at the ChatHub wire boundary", () => {
    const attachments = chatHubAttachments([
      { type: "file", url: "https://files.example.test/report.pdf", mimeType: "application/pdf", name: "report.pdf" },
      { type: "audio", url: "https://media.example.test/brief.mp3", mimeType: "audio/mpeg", name: "brief.mp3" },
    ]);
    expect(attachments).toEqual([
      { type: "file", url: "https://files.example.test/report.pdf", mimeType: "application/pdf", name: "report.pdf" },
      { type: "audio", url: "https://media.example.test/brief.mp3", mimeType: "audio/mpeg", name: "brief.mp3" },
    ]);
    const payload = chatPayload({
      text: "Use the attachments", conversationId: "conversation", sessionId: "session",
      started: true, tone: "Gpt_5_6_Chat", attachments,
    }, "request");
    expect(payload).toContain('"type":"file"');
    expect(payload).toContain('"type":"audio"');
  });

  it("accepts top-level Responses media parts", () => {
    const prepared = prepareResponsesMultimodal([
      { type: "input_file", file_url: "https://files.example.test/a.txt", filename: "a.txt" },
      { type: "input_audio", audio_url: "https://media.example.test/a.mp3", mime_type: "audio/mpeg" },
    ]);
    expect(prepared.attachments.map((item) => item.type)).toEqual(["file", "audio"]);
  });

  it("rejects private media URLs and request-wide count bypasses", () => {
    expect(() => normalizeMultimodalContents([[{ type: "file", file_url: "https://127.0.0.1/private" }]]))
      .toThrowError(MultimodalInputError);
    const messages = Array.from({ length: 5 }, (_, index) => [{
      type: "file", file_url: `https://files.example.test/${index}.txt`, filename: `${index}.txt`,
    }]);
    expect(() => normalizeMultimodalContents(messages)).toThrowError("INVALID_FILE");
  });
});
