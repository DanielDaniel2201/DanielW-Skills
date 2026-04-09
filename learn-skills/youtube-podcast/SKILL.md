---
name: youtube-podcast
description: Extract YouTube transcripts, clean them into timestamp-per-line markdown, and generate podcast summary + takeaways + mindmap + SEO blog post outputs. Use when a user provides a YouTube URL and wants transcript/summary/mindmap/blog assets saved under podcasts/<video-title>.
---

# YouTube Podcast Skill

Convert a YouTube podcast into structured local knowledge: a cleaned timestamped transcript, a summary + takeaways, a mindmap canvas, and an SEO-optimized blog post.

## Output Goal

When a user provides a YouTube URL, produce exactly these files under `podcasts/<video-title>/` (current working directory):

- `podcasts/<video-title>/transcript.md`
- `podcasts/<video-title>/summary.md`
- `podcasts/<video-title>/mindmap.canvas`
- `podcasts/<video-title>/blog-post.md`

## Workflow (End-to-End)

1. **Fetch Video Title**
   - Use the YouTube oEmbed API: `https://www.youtube.com/oembed?url=<YOUTUBE_URL>&format=json`.
   - Fetch the JSON content and extract the `title` field.
   - Sanitize for folder name: replace `<>:"/\\|?*` with `-`, collapse whitespace, trim.

2. **Create Output Folder**
   - Create `podcasts/<video-title>/` under the current working directory.

3. **Extract Transcript (Robust Method)**
   - Navigate to `https://www.youtube-transcript.io/` using `agent-browser`.
   - Input the YouTube URL and trigger extraction.
   - Use the **Chunked Redirection Strategy** to save the full text to `podcasts/<video-title>/raw.txt`.
   - **Critical**: Follow the specific loop-based extraction in [references/transcript-extraction.md](references/transcript-extraction.md) to avoid truncation.

4. **Clean Transcript (Markdown)**
   - Run `scripts/clean_transcript.py <raw.txt> -o <transcript.md>`.
   - Enforce one line per timestamp: `timestamp + sentence` only.

5. **Generate Summary + Takeaways (Markdown)**
   - Read `transcript.md` and write `summary.md` using this fixed structure:
     - `# Summary` (1–3 paragraphs)
     - `# Takeaways` (5–10 bullets)

6. **Generate Mindmap (JSON Canvas)**
   - Locally invoke the `json-canvas` skill to generate the file.
   - Use the **full content** of `transcript.md` as context.
   - Save as `mindmap.canvas`.

7. **Generate SEO Blog Post (Markdown)**
   - Read `transcript.md` and write `blog-post.md` following SEO best practices (compelling H1, meta description, H2/H3 structure, impactful quotes, and CTA).

## Example Commands

```bash
# 1. Fetch Title
curl -s "https://www.youtube.com/oembed?url=<URL>&format=json"

# 2. Extract Transcript (Robust Loop)
agent-browser open "https://www.youtube-transcript.io/"
# (Find refs, fill, click, wait...)
# Measure length
agent-browser eval "document.body.innerText.length"
# Run chunked loop (see references/transcript-extraction.md for details)
agent-browser eval "document.body.innerText.substring(0, 15000)" > "raw.txt"
agent-browser eval "document.body.innerText.substring(15000, 30000)" >> "raw.txt"
# ...repeat until end

# 3. Clean
python "scripts/clean_transcript.py" "raw.txt" -o "transcript.md"
```
