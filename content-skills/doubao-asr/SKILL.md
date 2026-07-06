---
name: doubao-asr
description: 把本地视频或音频直接转成豆包语音识别字幕文件的 standalone skill，自带运行脚本和配置模板。用户只要填自己的豆包 ASR 认证信息，就可以从一个本地视频得到 `srt` 字幕，并在视频同级生成一个命名为 `视频原名 + 豆包语音识别中间文件` 的目录，里面放词级时间戳、字幕分组、原始返回和抽出的音频。用户提到豆包语音识别、剪映字幕、SRT、视频转文字、口播转字幕、本地文件转写时使用
---

# doubao-asr

这是一个****standalone skill****

skill 自己带这些文件
- `scripts/doubao-asr.mjs`
- `.env.example`
- `.gitignore`

别人把这个 skill 带走以后，只需要再补一份自己的 `.env`，填入豆包 ASR 认证信息，就能直接用

当前默认使用****录音文件识别 1.0 极速版****

- 接口是 `https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash`
- 资源 ID 是 `volc.bigasr.auc_turbo`
- 调用方式是一次请求直接返回识别结果
- 适合本地视频或音频快速生成剪映可导入的 `srt`
- 默认会把本地媒体抽成较小的 `mp3`，再用 base64 上传

## 使用前提

运行环境需要有这些基础能力
- Node 22 或更高
- `ffmpeg`
- 可访问火山引擎录音文件识别极速版 HTTP 接口

这个 skill 不依赖外部模板工程

## 首次准备

1. 在 skill 目录里把 `.env.example` 复制成 `.env`
2. 填入自己的豆包 ASR 新版控制台 API Key
3. 至少保证这个字段有值

- `DOUBAO_ASR_API_KEY`

这个 skill 不启用旧版控制台认证，也不启用标准版或闲时版备用路径

## 执行方式

如果用户给了一个本地视频路径，直接在 skill 目录运行

```powershell
node scripts/doubao-asr.mjs "你的视频路径.mp4"
```

如果当前目录里只有一个媒体文件，也可以不传路径直接运行

```powershell
node scripts/doubao-asr.mjs
```

## 输入格式

支持这些媒体格式
- `.mp4`
- `.mp3`
- `.m4a`
- `.wav`
- `.mov`
- `.ogg`
- `.webm`

## 输出规则

假设输入文件叫 `demo.mp4`

最终字幕文件放在视频旁边
- `demo.captions.srt`

中间文件放在视频同级目录，目录名固定为
- `demo豆包语音识别中间文件`

中间文件目录里会有
- `demo.transcript.raw.json`
- `demo.transcript.json`
- `demo.captions.json`
- `demo.doubao-upload.mp3`

## 默认处理逻辑

脚本会自动做这些步骤

1. 从视频里抽出 16k、单声道、低码率 `mp3`
2. 把音频转成 base64，请求录音文件识别 1.0 极速版
3. 保存原始返回和字级时间戳
4. 按 10 到 15 个字、停顿和标点合并成字幕组
5. 智能清理常见口水词
6. 输出可导入剪映的 `srt`

极速版的限制需要记住

- 音频时长不超过 2 小时
- 上传音频不超过 100MB
- 支持 `wav`、`mp3`、`ogg opus`
- 资源 ID 默认是 `volc.bigasr.auc_turbo`

如果文件太大，优先调低 `DOUBAO_ASR_AUDIO_BITRATE`，或者切短音频后再处理

这里的口水词清理默认是轻度智能清理
- 优先清掉 `啊`、`呃`、`uh`、`um` 这类明显口水词
- 尽量不破坏正常句子节奏

如果用户后续还要更强的润色，再在生成后的 `srt` 基础上继续改

## 固定模式

这个 skill 固定只使用 1.0 极速版

- 接口固定为 `https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash`
- 资源 ID 固定为 `volc.bigasr.auc_turbo`
- `.env` 不配置 endpoint 和 resource id
- 不做标准版、闲时版、旧流式接口备用路径

## 检查结果

每次跑完至少确认两件事

1. 视频旁边已经有 `*.captions.srt`
2. 视频同级已经有 `视频原名 + 豆包语音识别中间文件`

如果要快速核对字幕质量，读取 `srt` 前几段，确认中文正常、时间轴连续、没有明显乱码

## 不要做的事

- 不要把中间文件放回 skill 目录
- 不要把 `.env` 内容抄进对话或文档
- 不要默认切回 Whisper、faster-whisper、whisper.cpp
- 不要把 API Key 写进 `SKILL.md` 或 `.env.example`

## 常见用法

用户说这些话时，优先使用这个 skill

- 帮我把这个视频转成剪映字幕
- 用豆包语音识别给这个 mp4 生成 srt
- 这个口播视频帮我转文字并保留时间戳
- 把本地视频做成字幕，中间文件单独放一个目录
