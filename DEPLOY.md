# Deploying the Volatility Dashboard (Streamlit Community Cloud — private)

This app runs on yfinance and SEC EDGAR, both token-free, so **no API keys or
secrets are required** to deploy. All third-party dependencies are pinned in
`requirements.txt`.

## 1. Put the project on GitHub

Commit the whole folder, keeping the structure intact:

```
shock_dashboard.py        ← main app (entry point)
design_renderer.py
quant_signals.py
design/                   ← JSX/CSS read at runtime — MUST be committed
requirements.txt
.gitignore
```

```bash
cd "Volatility Dashboard"
git init
git add .
git commit -m "Volatility dashboard"
git branch -M main
git remote add origin https://github.com/<you>/volatility-dashboard.git
git push -u origin main
```

A private GitHub repo is fine — Community Cloud can deploy from it.

## 2. Deploy

1. Go to https://share.streamlit.io and sign in with GitHub.
2. **Create app → Deploy a public app from GitHub** (or the private-app option).
3. Repository: your repo · Branch: `main` · **Main file path: `shock_dashboard.py`**.
4. (Optional) Advanced settings → Python version 3.12.
5. Deploy. First build takes a few minutes while it installs the requirements.

## 3. Make it private (visible to just you / a few people)

In the deployed app: **Settings → Sharing** → set to private and add viewer
emails to the allow-list. Viewers sign in with Google or a one-time emailed
link; only allow-listed addresses can open the app.

## Notes & limits

- **Resources:** Community Cloud apps run with ~1 GB RAM. The yfinance +
  rolling-regression workload fits, but that's the ceiling under heavy use.
- **No secrets needed today.** If you later add a keyed data source (e.g.
  Business Quant), put the key in **Settings → Secrets** as
  `BQ_API_KEY = "..."` — never in the repo. `.streamlit/secrets.toml` is already
  git-ignored.
- **Cold starts:** a private app sleeps when idle and takes a few seconds to wake.
- **Data caching** is already in place (`st.cache_data`), which keeps API calls
  within yfinance's informal rate limits.
