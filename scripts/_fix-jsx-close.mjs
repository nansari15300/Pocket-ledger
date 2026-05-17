import fs from "fs";

// AccountGroupList: shell is <div>, not motion.div
{
  const p = "src/components/bank-cash/AccountGroupList.tsx";
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(
    "      <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />\n    </motion.div>\n    </TooltipProvider>",
    "      <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />\n    </motion.div>\n    </TooltipProvider>"
  );
  // plain div close
  s = s.replace(
    "      <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />\n    </motion.div>\n    </TooltipProvider>",
    "      <EntityListQuickFilterBar active={quickFilter} onChange={setQuickFilter} />\n    </motion.div>\n    </TooltipProvider>"
  );
  fs.writeFileSync(p, s);
  console.log("AccountGroupList done");
}

// ExpenseAccountList empty branch: </motion.div> -> </motion.div> (div open)
{
  const p = "src/components/expenses/ExpenseAccountList.tsx";
  let s = fs.readFileSync(p, "utf8");
  const marker = "No accounts found.";
  const i = s.indexOf(marker);
  if (i < 0) throw new Error("marker missing");
  const chunk = s.slice(0, i);
  if (chunk.includes("</motion.div>") && chunk.includes('data-theme-list="account-list"')) {
    s = s.replace(
      /(<div\n          className=\{cn\(masterListShellCn, disabled && "pointer-events-none opacity-60"\)\}\n          data-theme-list="account-list"\n        >[\s\S]*?<EntityListQuickFilterBar active=\{quickFilter\} onChange=\{setQuickFilter\} \/>\n        )<\/motion.div>/,
      "$1</motion.div>"
    );
    // above still wrong - use div close
    s = fs.readFileSync(p, "utf8");
    s = s.replace(
      /(<motion.div\n          className=\{cn\(masterListShellCn, disabled && "pointer-events-none opacity-60"\)\}\n          data-theme-list="account-list"\n        >[\s\S]*?<EntityListQuickFilterBar active=\{quickFilter\} onChange=\{setQuickFilter\} \/>\n        )<\/motion.div>/,
      "$1</motion.div>"
    );
    s = fs.readFileSync(p, "utf8");
    s = s.replace(
      /(if \(filteredAndSortedAccounts\.length === 0\) \{[\s\S]*?<EntityListQuickFilterBar active=\{quickFilter\} onChange=\{setQuickFilter\} \/>\n        )<\/motion.div>/,
      "$1</motion.div>"
    );
  }
  fs.writeFileSync(p, s);
  console.log("ExpenseAccountList done");
}
