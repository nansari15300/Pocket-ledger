const http = require("http");
const crypto = require("crypto");

/** Firebase web OAuth client — `src/lib/firebase.ts` FIREBASE_WEB_OAUTH_CLIENT_ID se match. */
const FIREBASE_WEB_CLIENT_ID =
  "469450068553-h848203thcqi3u8mvl8bvnm7gh8v5icl.apps.googleusercontent.com";
/** Fixed loopback port — Google Cloud Console me ek baar redirect URI register karna. */
const CALLBACK_PORT = 28741;
const CALLBACK_PATH = "/__pl_google_auth_callback/";
const FINISH_PATH = "/__pl_google_auth_finish";

let callbackServer = null;
/** @type {Map<string, { resolve: (v: { idToken: string }) => void, reject: (e: Error) => void, timeout: NodeJS.Timeout }>} */
const pendingSessions = new Map();

function callbackPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Pocket Ledger — Google sign-in</title>
</head>
<body style="font-family:system-ui,sans-serif;padding:2rem;max-width:28rem;margin:auto">
  <p id="msg">Completing sign-in…</p>
  <script>
    (function () {
      var msg = document.getElementById("msg");
      var hash = new URLSearchParams((window.location.hash || "").replace(/^#/, ""));
      var idToken = hash.get("id_token");
      var state = hash.get("state");
      var err = hash.get("error") || hash.get("error_description");
      fetch("${FINISH_PATH}", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken, state: state, error: err }),
      })
        .then(function () {
          msg.textContent = "Sign-in complete. Close this browser tab and return to Pocket Ledger.";
        })
        .catch(function () {
          msg.textContent = "Could not finish sign-in. Close this tab and try again in the app.";
        });
    })();
  </script>
</body>
</html>`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 64 * 1024) {
        reject(new Error("body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function ensureCallbackServer() {
  if (callbackServer) return Promise.resolve(CALLBACK_PORT);
  return new Promise((resolve, reject) => {
    callbackServer = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url || "/", `http://127.0.0.1:${CALLBACK_PORT}`);
        const pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;

        if (pathname === CALLBACK_PATH || pathname === "/__pl_google_auth_callback/") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(callbackPageHtml());
          return;
        }

        if (pathname === `${FINISH_PATH}/` || url.pathname === FINISH_PATH) {
          if (req.method !== "POST") {
            res.writeHead(405);
            res.end("Method not allowed");
            return;
          }
          const body = await readJsonBody(req);
          const state = String(body.state || "").trim();
          const idToken = body.id_token ? String(body.id_token) : "";
          const error = body.error ? String(body.error) : "";
          const session = state ? pendingSessions.get(state) : null;
          if (session) {
            clearTimeout(session.timeout);
            pendingSessions.delete(state);
            if (error) session.reject(new Error(error));
            else if (idToken) session.resolve({ idToken });
            else session.reject(new Error("GOOGLE_AUTH_NO_TOKEN"));
          }
          res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      } catch {
        res.writeHead(500);
        res.end("Error");
      }
    });

    callbackServer.on("error", (err) => {
      callbackServer = null;
      reject(err);
    });
    callbackServer.listen(CALLBACK_PORT, "127.0.0.1", () => resolve(CALLBACK_PORT));
  });
}

function buildGoogleAuthUrl(redirectUri, sessionId, options = {}) {
  const params = new URLSearchParams({
    client_id: FIREBASE_WEB_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "id_token",
    scope: "openid email profile",
    nonce: sessionId,
    state: sessionId,
    prompt: "select_account",
  });
  const loginHint = String(options.loginHint || "").trim();
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * System browser (Chrome/Edge) me Google login — account chooser (select_account).
 * @param {{ openExternal: (url: string) => Promise<void> }} shell
 * @param {{ loginHint?: string }} [options]
 */
async function signInWithGoogleExternal(shell, options = {}) {
  const port = await ensureCallbackServer();
  const sessionId = crypto.randomUUID();
  const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;

  const promise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingSessions.delete(sessionId);
      reject(new Error("GOOGLE_AUTH_TIMEOUT"));
    }, 10 * 60 * 1000);
    pendingSessions.set(sessionId, { resolve, reject, timeout });
  });

  const authUrl = buildGoogleAuthUrl(redirectUri, sessionId, options);
  await shell.openExternal(authUrl);
  return promise;
}

module.exports = {
  signInWithGoogleExternal,
  CALLBACK_PORT,
  CALLBACK_PATH,
};
