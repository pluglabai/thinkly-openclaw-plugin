---
name: thinkly_capture
description: Save useful OpenClaw outputs into Thinkly with /clip and /ingest.
---

# Thinkly Capture

Use this skill when the user wants to keep useful OpenClaw output for later reuse in Thinkly.

## When to use it

- Use `/clip` to save the latest useful exchange from the current OpenClaw conversation.
- Use `/clip "text"` when the user points to one exact sentence or paragraph to save.
- Use `/ingest` when the user wants to collect URLs, pasted notes, or multiple items before saving.
- Use `/ingest save` after the buffer is ready and the user wants to send the collected items into Thinkly.
- Use `/ingest cancel` when the current buffer should be discarded.

## How to guide the user

- Prefer the smallest action that matches the request.
- If the user wants the latest answer saved, prefer `/clip`.
- If the user is gathering links or source material first, prefer `/ingest`.
- If Thinkly is not configured yet, tell the user to set `apiUrl` and `apiKey` in the Thinkly OpenClaw plugin config first.

## Config reminder

Use this config shape:

```json
{
  "apiUrl": "https://thinkly.pluglab.ai",
  "apiKey": "tk_your_api_key"
}
```

## Output expectation

After a successful save, tell the user that the content is now in Thinkly and can be reused as clips, pages, or briefs later.
