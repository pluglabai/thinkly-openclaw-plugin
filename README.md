# Thinkly OpenClaw Plugin

Turn AI chats, notes, files, and links into organized pages, briefs, and reusable
knowledge with Thinkly.

## Install with npm

```bash
openclaw plugins install @pluglab_thinkly/thinkly-openclaw-plugin
openclaw plugins enable thinkly
openclaw gateway restart
```

## Fallback install from GitHub Release

```bash
openclaw plugins install https://github.com/pluglabai/thinkly-openclaw-plugin/releases/download/openclaw-plugin-v0.1.1/thinkly-openclaw-plugin.tgz
openclaw plugins enable thinkly
openclaw gateway restart
```

## Required config

```json
{
  "apiUrl": "https://thinkly.pluglab.ai",
  "apiKey": "tk_your_api_key"
}
```

## What it does

- Save useful OpenClaw exchanges with `/clip`
- Save a specific line when only part of the conversation matters
- Collect text, URLs, and files with `/ingest`
- Turn saved material into organized pages, briefs, and reusable knowledge in Thinkly

## Release assets

Each release should include fallback install assets:

- `thinkly-openclaw-plugin.tgz`
- `thinkly-openclaw-plugin.tgz.sha256`

## Source of truth

This repository is the public npm publish source and public release surface.

Development source of truth lives in the private Thinkly monorepo and is exported here for public release.

## Version channels

- `latest`: default stable npm install
- `beta`: optional prerelease channel for future staged rollouts

## Product framing

This package follows the Thinkly `ai-workflow` landing message:

- dump AI chats, notes, files, and links once
- let Thinkly organize them automatically
- reuse them later as pages, briefs, and connected knowledge
