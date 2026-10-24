# HackNotts26
Project for hacknotts 26

BYTE is a little AI pet that lives on your wrist. It runs a local model through Ollama and uses MCP tools to actually do stuff. Right now it remembers things you tell it and reads them back, all stored on the Pi in SQLite. The phone app talks to the Pi over wifi.

# How to Setup
Need Node 24 and Ollama

```bash
ollama pull qwen3:1.7b
npm ci
cp .env.example .env
npm run build
npm start
```

# Authors
Roshan Prabhu
Ridwaan
