# Thinkly OpenClaw Plugin

Your best AI work should not die in thread history.

Thinkly turns AI chats into a reusable wiki and knowledge graph.
Save useful OpenClaw exchanges, notes, URLs, and files into Thinkly, and it keeps
turning them into connected pages, topic wikis, and reusable context you can build on.
The point is not saving more clips. The point is giving your best AI work a structure
that compounds instead of disappearing into chat history.

## Install with npm

```bash
openclaw plugins install @pluglab_thinkly/thinkly-openclaw-plugin
openclaw plugins enable thinkly
openclaw gateway restart
```

## Fallback install from GitHub Release

```bash
openclaw plugins install https://github.com/pluglabai/thinkly-openclaw-plugin/releases/download/openclaw-plugin-v0.1.2/thinkly-openclaw-plugin.tgz
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
- Turn saved material into connected pages, topic wikis, and reusable knowledge in Thinkly

## Why power users install it

- AI chats stop living as isolated threads and start becoming a reusable knowledge base
- reviewed inputs can keep compounding into pages, briefs, and topic structures
- you get the upside of a wiki and graph workflow without building a DIY stack first

## What Thinkly builds from your inputs

- reusable clips you can keep and reference later
- pages that gather related context in one place
- topic wikis that keep growing as more material comes in
- a knowledge graph that keeps related material connected instead of scattered

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
