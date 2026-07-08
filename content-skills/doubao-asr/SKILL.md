---
name: doubao-asr
description: 把本地视频或音频直接转成豆包语音识别字幕文件的 standalone skill，自带运行脚本和配置模板。用户只要填自己的豆包 ASR 认证信息，就可以从一个本地视频得到 `srt` 字幕，并在视频同级生成一个命名为 `视频原名 + 豆包语音识别中间文件` 的目录，里面放词级时间戳、字幕分组、原始返回和抽出的音频。用户提到豆包语音识别、剪映字幕、SRT、视频转文字、口播转字幕、本地文件转写、怎么开始使用、怎么配置、怎么拿 API Key 时使用
---

# doubao-asr

这是一个****standalone skill****

skill 自己带这些文件
- `scripts/doubao-asr.mjs`
- `.env.example`
- `.gitignore`

别人把这个 skill 带走以后，只需要再补一份自己的 `.env`，填入豆包 ASR 认证信息，就能直接用

## 首次使用先给用户 onboarding

当用户第一次使用这个 skill，或者明确问这个 skill 怎么开始用、怎么配置、怎么拿 API Key 时，先不要直接讲运行命令，先把下面这套 onboarding 流程告诉用户

1. 打开 `https://www.volcengine.com`
2. 点击右上角登录，如果还没有账号就先注册再登录
3. 登录后点击右上角的控制台
4. 进入控制台后，在快捷导航下面点击豆包语音
5. 进入后点击左上角的新版界面
6. 找到快速开始里的开通服务，点击前往开通
7. 开通完成后，去左侧边栏往下滑，找到 `API Key 管理`
8. 点击后，系统会自动生成一个 API Key，把这个 API Key 复制出来
9. 打开你本地的豆包 ASR skill 目录，把 `.env.example` 复制一份并重命名为 `.env`
10. 打开 `.env`，找到 `DOUBAO_ASR_API_KEY=` 这一行
11. 把刚才复制的 API Key 填进去并保存
12. 到这一步，这个 skill 就配置完成了，接下来再运行转写脚本

如果用户只是问怎么开始，不需要一次讲太多实现细节，优先把上面这 12 步讲清楚

如果用户已经完成配置，再继续讲运行方式、输入格式、输出规则

如果用户没有 `.env`，明确提醒他从 `.env.example` 复制，不要手写一个空文件

如果用户担心自己找不到文件，直接告诉他要打开这个 skill 目录里的 `.env.example`

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
4. 优先读取豆包返回的 `utterances` 作为自然语音分段底稿
5. 在每个 `utterance` 内按标点、停顿和字幕长度生成候选字幕
6. 用 `utterance.words` 里的字词级时间戳校准每条字幕的起止时间
7. 用脚本规则合并太短字幕、拆短太长字幕
8. 输出字幕文本时去掉中文和英文常见标点
9. 智能清理常见口水词
10. 输出可导入剪映的 `srt`

默认字幕生成是****确定性脚本规则****，不是 AI 临场判断

- 豆包 ASR 负责识别声音，返回整段全文、`utterances`、字词级 `words`
- 脚本负责把 `utterances` 整理成适合短视频阅读的字幕
- Codex / AI Agent 只负责运行脚本、检查结果、必要时修改 skill
- 默认不调用 AI 重写字幕、不让 AI 决定每条字幕怎么分

默认字幕长度策略

- `DOUBAO_ASR_CAPTION_MIN_CHARS=8`
- `DOUBAO_ASR_CAPTION_TARGET_CHARS=18`
- `DOUBAO_ASR_CAPTION_MAX_CHARS=22`
- `DOUBAO_ASR_CAPTION_PAUSE_SECONDS=0.45`
- `DOUBAO_ASR_CAPTION_PUNCTUATION_OVERSHOOT=4`

也就是说，脚本会尽量让字幕落在 8 到 22 个字之间，目标靠近 18 个字

如果一句话马上要遇到标点，脚本允许最多多带 4 个字，避免把“视频。”切成“视 / 频。”这种不自然字幕

标点只用于判断哪里适合断句，最终 `captions.json` 和 `srt` 默认不保留标点符号

如果字幕太碎，优先调大 `DOUBAO_ASR_CAPTION_MIN_CHARS`

如果字幕太长，优先调小 `DOUBAO_ASR_CAPTION_MAX_CHARS`

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
- 这个 skill 怎么开始用
- 豆包语音识别的 API Key 去哪拿
- 帮我配置一下豆包 ASR skill
