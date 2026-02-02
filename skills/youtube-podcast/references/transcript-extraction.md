# Robust Transcript Extraction via agent-browser

When extracting long transcripts (e.g., >30 minutes) from web tools like `youtube-transcript.io`, direct extraction of `innerText` often fails due to terminal/buffer truncation limits (~30,000 characters).

To ensure 100% data integrity, use the **Chunked Redirection Strategy**.

## Step-by-Step Workflow

### 1. Initialization
- Navigate to the transcript tool and trigger the generation.
- Ensure the transcript is fully rendered in the DOM (e.g., wait for a "Copy" button or specific text).

### 2. Length Measurement
Measure the total length of the target text to plan the chunks.
```bash
agent-browser eval "document.body.innerText.length"
```

### 3. Chunked Extraction
Extract the text in segments of **15,000 characters** to stay safely within buffer limits, appending each chunk to the local file using shell redirection (`>>`).

**Bash Implementation:**
```bash
# Initialize/Clear file
> "path/to/raw.txt"

# Loop through chunks (calculate iterations based on length)
# Example for 120,000 characters (8 chunks of 15k)
for i in {0..7}; do
  start=$((i * 15000))
  agent-browser eval "document.body.innerText.substring($start, $((start + 15000)))" >> "path/to/raw.txt"
done
```

### 4. Verification
Verify the end of the file against the end of the webpage to ensure no data was missed.
```bash
tail -n 20 "path/to/raw.txt"
```

## Why this is Robust
- **Circumvents Truncation**: By limiting each transfer to <30k characters, it prevents the agent-to-terminal buffer from dropping data.
- **Direct Persistence**: Redirection (`>>`) ensures data goes straight to disk.
- **Deterministic**: The loop ensures every character from index 0 to N is captured.
