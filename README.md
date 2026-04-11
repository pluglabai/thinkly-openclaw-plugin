# Thinkly OpenClaw Plugin

Public distribution repository for the Thinkly plugin for OpenClaw.

## Install

```bash
openclaw plugins install https://github.com/pluglabai/thinkly-openclaw-plugin/releases/download/openclaw-plugin-v0.1.0/thinkly-openclaw-plugin.tgz
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

- Save the latest exchange with `/clip`
- Save a specific line with `/clip "text"`
- Collect text, URLs, and files with `/ingest`
- Send collected items into Thinkly with `/ingest save`

## Release assets

Each release should include:

- `thinkly-openclaw-plugin.tgz`
- `thinkly-openclaw-plugin.tgz.sha256`

## Source of truth

This repository is the public distribution surface.

Development source of truth lives in the private Thinkly monorepo and is exported here for public release.
