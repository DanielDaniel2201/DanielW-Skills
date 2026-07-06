import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, "..");
const env = loadEnv(path.join(skillRoot, ".env"));

const inputPath = resolveInputPath();
const inputBaseName = path.basename(inputPath, path.extname(inputPath));
const inputDir = path.dirname(inputPath);
const artifactDir = path.join(inputDir, `${inputBaseName}豆包语音识别中间文件`);
const uploadFormat = (env.DOUBAO_ASR_UPLOAD_FORMAT || "mp3").toLowerCase();
const uploadAudioPath = path.join(artifactDir, `${inputBaseName}.doubao-upload.${uploadFormat}`);
const rawOutPath = path.join(artifactDir, `${inputBaseName}.transcript.raw.json`);
const transcriptOutPath = path.join(artifactDir, `${inputBaseName}.transcript.json`);
const captionsOutPath = path.join(artifactDir, `${inputBaseName}.captions.json`);
const srtOutPath = path.join(inputDir, `${inputBaseName}.captions.srt`);

const endpoint = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const resourceId = "volc.bigasr.auc_turbo";
const sampleRate = Number(env.DOUBAO_ASR_SAMPLE_RATE || 16000);
const channels = Number(env.DOUBAO_ASR_CHANNELS || 1);
const audioBitrate = env.DOUBAO_ASR_AUDIO_BITRATE || "48k";
const maxUploadBytes = Number(env.DOUBAO_ASR_MAX_UPLOAD_MB || 100) * 1024 * 1024;
const minCaptionChars = Number(env.DOUBAO_ASR_CAPTION_MIN_CHARS || 10);
const maxCaptionChars = Number(env.DOUBAO_ASR_CAPTION_MAX_CHARS || 15);
const captionPauseSeconds = Number(env.DOUBAO_ASR_CAPTION_PAUSE_SECONDS || 0.45);

main().catch((error) => {
  console.error(`[asr] failed: ${error.message}`);
  process.exitCode = 1;
});

async function main() {
  if (!fs.existsSync(inputPath)) throw new Error(`Input media not found: ${inputPath}`);

  validateConfig();
  ensureDir(artifactDir);

  console.log(`[asr] extracting ${uploadFormat} audio for Doubao flash recognition`);
  extractUploadAudio(inputPath, uploadAudioPath);

  const audio = fs.readFileSync(uploadAudioPath);
  if (audio.length > maxUploadBytes) {
    throw new Error(
      `Audio upload is ${(audio.length / 1024 / 1024).toFixed(1)}MB, over ${env.DOUBAO_ASR_MAX_UPLOAD_MB || 100}MB. Use a lower bitrate or a shorter file.`,
    );
  }
  console.log(`[asr] upload audio=${uploadAudioPath}`);
  console.log(`[asr] upload bytes=${audio.length}`);

  const raw = await recognizeFlash(audio);
  fs.writeFileSync(rawOutPath, JSON.stringify(raw, null, 2), "utf8");

  const words = extractWords(raw.body);
  if (!words.length) {
    throw new Error(`ASR returned no word or utterance timestamps. See ${rawOutPath}`);
  }

  fs.writeFileSync(transcriptOutPath, JSON.stringify(words, null, 2), "utf8");

  const captions = buildCaptionGroups(cleanWords(words));
  fs.writeFileSync(captionsOutPath, JSON.stringify(captions, null, 2), "utf8");
  fs.writeFileSync(srtOutPath, toSrt(captions), "utf8");

  const preview = captions.slice(0, 5).map((c) => c.text).join(" / ");
  console.log(`[asr] wrote ${words.length} words, ${captions.length} caption groups`);
  console.log(`[asr] raw: ${rawOutPath}`);
  console.log(`[asr] transcript: ${transcriptOutPath}`);
  console.log(`[asr] captions: ${captionsOutPath}`);
  console.log(`[asr] srt: ${srtOutPath}`);
  console.log(`[asr] preview: ${preview}`);
}

function resolveInputPath() {
  const explicitInput = process.argv[2]?.trim();
  if (explicitInput) {
    return path.resolve(process.cwd(), explicitInput);
  }

  const supportedExtensions = new Set([".mp4", ".mp3", ".m4a", ".wav", ".mov", ".ogg", ".webm"]);
  const candidates = fs
    .readdirSync(process.cwd(), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => supportedExtensions.has(path.extname(name).toLowerCase()))
    .sort((left, right) => left.localeCompare(right, "zh-CN"));

  if (candidates.length === 1) {
    return path.join(process.cwd(), candidates[0]);
  }

  if (candidates.length === 0) {
    throw new Error("No input media found in current directory. Pass a file path to the script, or keep exactly one media file in the current directory.");
  }

  throw new Error(`Multiple media files found in current directory: ${candidates.join(", ")}. Pass the file you want to transcribe explicitly.`);
}

function validateConfig() {
  if (!env.DOUBAO_ASR_API_KEY) {
    throw new Error("Missing DOUBAO_ASR_API_KEY in .env.");
  }

  if (!["mp3", "wav", "ogg"].includes(uploadFormat)) {
    throw new Error(`Unsupported DOUBAO_ASR_UPLOAD_FORMAT=${uploadFormat}. Use mp3, wav, or ogg.`);
  }
}

function extractUploadAudio(sourcePath, targetPath) {
  const args = [
    "-y",
    "-i",
    sourcePath,
    "-vn",
    "-ac",
    String(channels),
    "-ar",
    String(sampleRate),
  ];

  if (uploadFormat === "mp3") {
    args.push("-b:a", audioBitrate, "-f", "mp3", targetPath);
  } else if (uploadFormat === "wav") {
    args.push("-acodec", "pcm_s16le", "-f", "wav", targetPath);
  } else if (uploadFormat === "ogg") {
    args.push("-c:a", "libopus", "-b:a", audioBitrate, "-f", "ogg", targetPath);
  }

  run("ffmpeg", args);
}

async function recognizeFlash(audio) {
  const requestId = crypto.randomUUID();
  const headers = {
    "Content-Type": "application/json",
    "X-Api-Key": env.DOUBAO_ASR_API_KEY,
    "X-Api-Resource-Id": resourceId,
    "X-Api-Request-Id": requestId,
    "X-Api-Sequence": "-1",
  };

  const body = {
    user: {
      uid: env.DOUBAO_ASR_UID || "codex-doubao-asr",
    },
    audio: {
      data: audio.toString("base64"),
      format: uploadFormat,
    },
    request: {
      model_name: "bigmodel",
      enable_itn: readBool("DOUBAO_ASR_ENABLE_ITN", true),
      enable_punc: readBool("DOUBAO_ASR_ENABLE_PUNC", true),
      enable_ddc: readBool("DOUBAO_ASR_ENABLE_DDC", false),
      enable_speaker_info: readBool("DOUBAO_ASR_ENABLE_SPEAKER_INFO", false),
      enable_channel_split: readBool("DOUBAO_ASR_ENABLE_CHANNEL_SPLIT", false),
      show_utterances: true,
      vad_segment: readBool("DOUBAO_ASR_VAD_SEGMENT", false),
    },
  };

  if (env.DOUBAO_ASR_LANGUAGE) body.audio.language = env.DOUBAO_ASR_LANGUAGE;
  if (env.DOUBAO_ASR_END_WINDOW_SIZE) body.request.end_window_size = Number(env.DOUBAO_ASR_END_WINDOW_SIZE);
  if (env.DOUBAO_ASR_SENSITIVE_WORDS_FILTER) body.request.sensitive_words_filter = env.DOUBAO_ASR_SENSITIVE_WORDS_FILTER;

  console.log(`[asr] calling Doubao flash endpoint, resource=${resourceId}, request=${requestId}`);
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  const statusCode = response.headers.get("x-api-status-code") || "";
  const message = response.headers.get("x-api-message") || "";
  const logId = response.headers.get("x-tt-logid") || "";
  const parsedBody = parseJson(responseText);

  console.log(`[asr] response code=${statusCode || response.status} message=${message || response.statusText} logid=${logId}`);

  if (!response.ok || statusCode !== "20000000") {
    const detail = responseText.slice(0, 800);
    throw new Error(`Doubao flash recognition failed. http=${response.status} code=${statusCode} message=${message} logid=${logId} body=${detail}`);
  }

  return {
    request_id: requestId,
    endpoint,
    resource_id: resourceId,
    status: {
      http_status: response.status,
      code: statusCode,
      message,
      log_id: logId,
    },
    body: parsedBody,
  };
}

function parseJson(text) {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractWords(payload) {
  const result = payload?.result || payload || {};
  const utterances = Array.isArray(result.utterances) ? result.utterances : [];
  const words = [];

  for (const utterance of utterances) {
    if (Array.isArray(utterance.words) && utterance.words.length) {
      for (const word of utterance.words) {
        const text = normalizeText(word.text);
        if (!text) continue;
        words.push({
          text,
          start: msToSeconds(word.start_time ?? utterance.start_time),
          end: msToSeconds(word.end_time ?? utterance.end_time),
        });
      }
      continue;
    }

    const text = normalizeText(utterance.text);
    if (!text) continue;
    words.push({
      text,
      start: msToSeconds(utterance.start_time),
      end: msToSeconds(utterance.end_time),
    });
  }

  return dedupeWords(words)
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function dedupeWords(words) {
  const byKey = new Map();
  for (const word of words) {
    const key = `${word.text}|${word.start.toFixed(3)}|${word.end.toFixed(3)}`;
    byKey.set(key, word);
  }
  return [...byKey.values()];
}

function buildCaptionGroups(words) {
  const groups = [];
  let current = [];

  const flush = () => {
    if (!current.length) return;
    const text = current.map((w) => w.text).join("").replace(/\s+/g, " ").trim();
    if (text) {
      groups.push({
        text,
        start: round(current[0].start),
        end: round(Math.max(current[current.length - 1].end, current[0].start + 0.45)),
      });
    }
    current = [];
  };

  for (const word of words) {
    const previous = current[current.length - 1];
    const projected = current.map((w) => w.text).join("").length + word.text.length;
    const pause = previous ? word.start - previous.end : 0;
    const punctuationBreak = previous ? /[，。！？!?；;：:]$/.test(previous.text) : false;
    if (current.length && (projected > maxCaptionChars || pause > captionPauseSeconds || punctuationBreak)) flush();
    current.push(word);
    const chars = current.map((w) => w.text).join("").length;
    if (chars >= minCaptionChars && /[，。！？!?；;：:]$/.test(word.text)) flush();
  }
  flush();

  return groups.map((group, index, arr) => {
    const next = arr[index + 1];
    if (next && group.end > next.start - 0.04) {
      return { ...group, end: round(Math.max(group.start + 0.35, next.start - 0.04)) };
    }
    return group;
  });
}

function cleanWords(words) {
  const fillerWords = new Set(["啊", "呃", "嗯", "uh", "um", "ah", "er"]);
  return words.filter((word, index, arr) => {
    const text = String(word.text || "").trim().toLowerCase();
    if (!fillerWords.has(text)) return true;

    const previous = arr[index - 1];
    const next = arr[index + 1];
    const prevGap = previous ? word.start - previous.end : Number.POSITIVE_INFINITY;
    const nextGap = next ? next.start - word.end : Number.POSITIVE_INFINITY;
    return prevGap > 0.55 && nextGap > 0.55;
  });
}

function toSrt(captions) {
  return captions
    .map((caption, index) => [
      String(index + 1),
      `${srtTime(caption.start)} --> ${srtTime(caption.end)}`,
      caption.text,
      "",
    ].join("\n"))
    .join("\n");
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const n = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(n).padStart(3, "0")}`;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function msToSeconds(value) {
  return Number(value) / 1000;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function readBool(key, defaultValue) {
  if (!(key in env)) return defaultValue;
  return /^(1|true|yes|on)$/i.test(String(env[key]).trim());
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`);
}

function loadEnv(file) {
  const data = { ...process.env };
  if (!fs.existsSync(file)) {
    throw new Error(`Missing .env at ${file}. Copy .env.example to .env and fill your Doubao ASR credentials first.`);
  }
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    data[key] = value;
  }
  return data;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
