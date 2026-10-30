# Muse

## Deploy (Render, free)
1. Put this folder in a GitHub repo.
2. Render dashboard → New → Blueprint → select the repo. It reads render.yaml.
3. When asked, enter ANTHROPIC_API_KEY. APP_PASSWORD is generated automatically (copy it from the Environment tab).
4. Your link: https://muse.onrender.com (or similar). Login: username `muse`, password = APP_PASSWORD.

## Make the Android APK
Go to https://www.pwabuilder.com, paste your Render link, choose Android → Generate, and download the .apk.

## Run locally
ANTHROPIC_API_KEY=... APP_PASSWORD=... node server.js
