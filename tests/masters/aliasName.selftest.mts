/**
 * Alias Name persistence/search regression (node).
 * Run: npx --yes tsx tests/masters/aliasName.selftest.mts
 * Covers the pure layers every save path goes through: local SQLite JSON (de)serialiser,
 * sync payload JSON round-trip, live-list fingerprint, master list search.
 */
let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${JSON.stringify(got)}${ok ? "" : `  want ${JSON.stringify(want)}`}`);
};

const party = { id: "p1", name: "JSK Oil Pump", aliasName: "Jay Syarsekalika Oil Center", pan: "302566868", balance: -12999.7, openingBalanceDate: new Date("2026-07-16T00:00:00Z") };
const legacy = { id: "p0", name: "Old Party", pan: "1", balance: 0 };

const mirror = await import("../../src/lib/localCompanyDocMirror");
// SQLite company_docs.data is TEXT (JSON) - serialise exactly as upsert does, then read back like list/get do
const stored = JSON.stringify(mirror.serializeCompanyDocForLocalDb(party));
const back = mirror.deserializeLocalDbValue(JSON.parse(stored)) as Record<string, unknown>;
eq("offline SQLite JSON round-trip keeps aliasName", back.aliasName, party.aliasName);
const backLegacy = mirror.deserializeLocalDbValue(JSON.parse(JSON.stringify(mirror.serializeCompanyDocForLocalDb(legacy)))) as Record<string, unknown>;
eq("legacy row without aliasName unaffected", [backLegacy.aliasName ?? null, backLegacy.name], [null, "Old Party"]);
// edit path merge: { ...base(fromDb), ...updatePayload }
const edited = { ...back, ...{ name: "JSK Oil Pump", aliasName: "" } };
eq("edit can clear aliasName", JSON.parse(JSON.stringify(mirror.serializeCompanyDocForLocalDb(edited))).aliasName, "");

// sync push/pull ship the whole doc JSON (no field whitelist found) - simulate wire round-trip
const wire = JSON.parse(JSON.stringify({ op: "upsert", collection: "parties", id: "p1", data: mirror.serializeCompanyDocForLocalDb(party) }));
eq("sync payload keeps aliasName", (mirror.deserializeLocalDbValue(wire.data) as Record<string, unknown>).aliasName, party.aliasName);

const live = await import("../../src/lib/masterEntityLiveUpdate");
eq("live list fingerprint changes when alias edited", live.masterEntityProfileUiFields(party) !== live.masterEntityProfileUiFields({ ...party, aliasName: "X" }), true);

const f = await import("../../src/lib/filterMasterEntityListRows");
const rows = [party, legacy];
eq("list search by alias", f.filterAndSortMasterEntityListRows(rows as never, "syarsekalika", "default").map((r) => (r as unknown as { id: string }).id), ["p1"]);
eq("list search by name still works", f.filterAndSortMasterEntityListRows(rows as never, "old", "default").map((r) => (r as unknown as { id: string }).id), ["p0"]);
eq("empty search lists all", f.filterAndSortMasterEntityListRows(rows as never, "", "name").length, 2);

const ps = await import("../../src/lib/interCompany/partyListRowSearch");
eq("party list search by alias", [ps.partyListRowMatchesSearch(party as never, "jay oil"), ps.partyListRowMatchesSearch(legacy as never, "jay")], [true, false]);

console.log(`\n${fail ? "FAILED" : "ALL PASSED"} (${fail} failure(s))`);
process.exit(fail ? 1 : 0);
