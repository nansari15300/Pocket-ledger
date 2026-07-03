/**
 * P2P mirror protocol — keep in sync with src/lib/plMirrorProtocol.ts
 *
 * | Client vs Server | Action                          |
 * |------------------|---------------------------------|
 * | Same version     | Normal                          |
 * | Off by 1         | Warn (upgrade one side)         |
 * | Off by 2+        | Reject sync (major mismatch)      |
 */

const PL_MIRROR_PROTOCOL_VERSION = 3;
/** abs(client - server) >= this → reject (major breaking change). */
const PL_MIRROR_PROTOCOL_MAJOR_REJECT_DELTA = 2;

/**
 * @param {unknown} clientProtocol
 * @param {unknown} serverProtocol
 */
function evaluateMirrorProtocol(clientProtocol, serverProtocol) {
  const client = Number(clientProtocol);
  const server = Number(serverProtocol);
  const base = {
    clientProtocol: Number.isFinite(client) ? client : null,
    serverProtocol: Number.isFinite(server) ? server : null,
  };
  if (!Number.isFinite(client) || client <= 0 || !Number.isFinite(server) || server <= 0) {
    return { action: "ok", code: "mirror_protocol_unknown", ...base };
  }
  const diff = client - server;
  const abs = Math.abs(diff);
  if (abs === 0) {
    return { action: "ok", code: "mirror_protocol_match", ...base };
  }
  if (abs >= PL_MIRROR_PROTOCOL_MAJOR_REJECT_DELTA) {
    return {
      action: "reject",
      code: "mirror_protocol_major_mismatch",
      message: `Mirror protocol major mismatch (client ${client}, server ${server}). Update Pocket Ledger on both PCs to the same version.`,
      ...base,
    };
  }
  if (diff < 0) {
    return {
      action: "warn",
      code: "mirror_protocol_older_client",
      message: `Client mirror protocol ${client} is older than server ${server}. Update the client app when possible.`,
      ...base,
    };
  }
  return {
    action: "warn",
    code: "mirror_protocol_newer_client",
    message: `Client mirror protocol ${client} is newer than server ${server}. Update the server PC app when possible.`,
    ...base,
  };
}

module.exports = {
  PL_MIRROR_PROTOCOL_VERSION,
  PL_MIRROR_PROTOCOL_MAJOR_REJECT_DELTA,
  evaluateMirrorProtocol,
};
