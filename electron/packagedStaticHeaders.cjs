/** serve-handler headers for packaged static `out/` — *.mjs MIME for pdf.js worker in Electron. */
function packagedStaticServeHeaders(_isPackaged) {
  return [
    {
      source: "**/*.mjs",
      headers: [{ key: "Content-Type", value: "text/javascript; charset=utf-8" }],
    },
  ];
}

module.exports = { packagedStaticServeHeaders };
