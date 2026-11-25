/* Site settings in one place. CA stays "SOON" until the token exists; then the real address goes here, one commit, and every
   page shows it with a copy button. API is the read API origin ("" = this origin), RPC the JSON-RPC for live chain reads ("" = this
   origin's read-only /api/rpc; wallets send transactions themselves), STREAM the runner's live stream URL on the runner's own host
   ("" = not live yet: pages show a quiet state and never connect). */
window.IA = { NAME: "Internal Affairs", TICKER: "IA", CA: "SOON", X_URL: "", DOMAIN: "", PROGRAM: "CAnntf6D3Ec3jZpzqSDmShvWbmvF6Dhk9rJYR1jxyVnr", API: "", RPC: "", STREAM: "", NETWORK: "mainnet", REPO: "https://github.com/liakh10/ia" };
