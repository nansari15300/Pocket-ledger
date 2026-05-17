import fs from "fs";

const p = "src/app/(dashboard)/party/page.tsx";
let s = fs.readFileSync(p, "utf8");

const replacement = `        tabs={
          <Tabs value={activeView} onValueChange={handlePartyGroupsTabChange} className="w-full">
            <TabsList listChrome>
              <TabsTrigger listChrome value="parties" className="flex-1">Parties</TabsTrigger>
              <TabsTrigger listChrome value="groups" className="flex-1">Groups</TabsTrigger>
            </TabsList>
          </Tabs>
        }`;

s = s.replace(
  /        tabs=\{\s*\/\* PC-only[\s\S]*?          <\/div>\s*\}/,
  replacement
);

fs.writeFileSync(p, s);
console.log("patched", p);
