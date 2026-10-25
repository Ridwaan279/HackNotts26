# HackNotts26
Project for hacknotts 26

Iki is a little AI pet (like tamagotchi) that lives on your wrist (but is a stationary box right now). Hermes Agent is the brain, it runs on the Pi with a local model through Ollama, remembers things you tell it and can use tools to actually do stuff. The phone app talks to the Pi over wifi.

# How to Setup
Need Node 24, Ollama and Hermes Agent with its API server on

```bash
npm ci
cp .env.example .env
npm run build
npm start
```

# Authors
Roshan Prabhu
Ridwaan
