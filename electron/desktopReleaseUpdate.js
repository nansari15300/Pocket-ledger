const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const { shell } = require("electron");

function pickProtocol(url) {
  return String(url || "").startsWith("http://") ? http : https;
}

function installerFileName(version) {
  const v = String(version || "").trim() || "latest";
  return `Pocket Ledger Setup ${v}.exe`;
}

function updatesDir(userDataPath) {
  return path.join(userDataPath, "pl-release-updates");
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const protocol = pickProtocol(url);
    const request = protocol.get(url, (response) => {
      const status = Number(response.statusCode || 0);
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        downloadFile(location, destPath, onProgress).then(resolve).catch(reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`Download failed (${status})`));
        return;
      }
      const total = Number(response.headers["content-length"] || 0);
      let received = 0;
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const file = fs.createWriteStream(destPath);
      response.on("data", (chunk) => {
        received += chunk.length;
        if (typeof onProgress === "function") onProgress({ received, total });
      });
      response.pipe(file);
      file.on("finish", () => file.close(() => resolve(destPath)));
      file.on("error", (err) => {
        try {
          fs.unlinkSync(destPath);
        } catch (_) {}
        reject(err);
      });
    });
    request.on("error", reject);
  });
}

function fileLooksComplete(filePath, expectedBytes) {
  try {
    const st = fs.statSync(filePath);
    if (!st.isFile() || st.size < 1024 * 1024) return false;
    if (expectedBytes > 0 && st.size !== expectedBytes) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function launchWindowsInstaller(installerPath) {
  spawn(installerPath, [], { detached: true, stdio: "ignore", windowsHide: false }).unref();
}

/**
 * Download NSIS installer to userData/pl-release-updates, then launch it and quit the app.
 */
async function downloadAndInstallRelease({ app, userDataPath, url, version, onProgress }) {
  const safeUrl = String(url || "").trim();
  const safeVersion = String(version || "").trim();
  if (!safeUrl || !safeVersion) throw new Error("Missing update URL or version.");

  const destPath = path.join(updatesDir(userDataPath), installerFileName(safeVersion));
  let expectedBytes = 0;
  if (fileLooksComplete(destPath, 0)) {
    onProgress?.({ received: fs.statSync(destPath).size, total: fs.statSync(destPath).size, reused: true });
  } else {
    await downloadFile(safeUrl, destPath, (p) => {
      if (p.total > 0) expectedBytes = p.total;
      onProgress?.(p);
    });
    if (!fileLooksComplete(destPath, expectedBytes)) {
      throw new Error("Downloaded installer looks incomplete.");
    }
  }

  if (process.platform === "win32") {
    launchWindowsInstaller(destPath);
  } else {
    await shell.openPath(destPath);
  }

  setTimeout(() => {
    try {
      app.quit();
    } catch (_) {}
  }, 600);

  return { ok: true, installerPath: destPath };
}

module.exports = {
  downloadAndInstallRelease,
  installerFileName,
};
