import { calculateReducingEmi, periodicRate } from "./emiCalculator";
import { generateLoanSchedule } from "./scheduleGenerator";
import { generateDueDates, isLeapYear, parseIsoDate, formatIsoDate } from "../utils/loanDateUtils";
import { roundMoney } from "../utils/loanRounding";
import { regenerateFutureSchedule } from "../services/loanScheduleService";
import { dailyInterest } from "./dailyReducingBalance";
import type { Loan } from "../types/loanTypes";

type Result = { passed: number; failed: string[] };

function assert(cond: boolean, msg: string, result: Result) {
  if (cond) result.passed += 1;
  else result.failed.push(msg);
}

export function runLoanCalculationSelfTests(): Result {
  const result: Result = { passed: 0, failed: [] };
  const principal = 5_000_000;
  const annualRate = 10.5;
  const n = 60;
  const r = periodicRate(annualRate, "monthly");
  const emi = calculateReducingEmi(principal, r, n);

  assert(emi > 0, "EMI should be positive", result);
  assert(Math.abs(r - 0.105 / 12) < 1e-12, "Monthly rate should be 10.5%/12", result);

  const dueDates = generateDueDates({
    firstPaymentDate: "2026-09-01",
    installmentCount: n,
    frequency: "monthly",
    paymentDayMode: "same_day",
  });
  assert(dueDates[0] === "2026-09-01", "First due date 2026-09-01", result);
  assert(dueDates[1] === "2026-10-01", "Second due date 2026-10-01", result);
  assert(dueDates[dueDates.length - 1] === "2031-08-01", "Final due date 2031-08-01", result);

  const feb = generateDueDates({
    firstPaymentDate: "2028-01-31",
    installmentCount: 3,
    frequency: "monthly",
    paymentDayMode: "same_day",
  });
  assert(feb[1] === "2028-02-29", `Leap February clamp, got ${feb[1]}`, result);
  assert(isLeapYear(2028), "2028 is leap year", result);

  const monthEnd = generateDueDates({
    firstPaymentDate: "2026-01-31",
    installmentCount: 3,
    frequency: "monthly",
    paymentDayMode: "month_end",
  });
  assert(monthEnd[1] === "2026-02-28", `Month-end Feb, got ${monthEnd[1]}`, result);
  assert(monthEnd[2] === "2026-03-31", `Month-end Mar, got ${monthEnd[2]}`, result);

  const schedule = generateLoanSchedule({
    principal,
    interestRate: annualRate,
    interestMethod: "reducing_balance",
    tenure: 60,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    disbursementDate: "2026-08-01",
    firstPaymentDate: "2026-09-01",
    paymentDayMode: "same_day",
  });
  assert(schedule.length === 60, "60 installments", result);
  const first = schedule[0]!;
  assert(first.openingPrincipal === principal, "Opening principal is original principal", result);
  assert(roundMoney(first.principalDue + first.interestDue) === first.totalDue, "EMI split equals total due", result);
  assert(first.interestDue > 0 && first.principalDue > 0, "First row splits principal and interest", result);
  assert(Math.abs(first.interestDue - roundMoney(principal * r)) < 0.02, "First interest from outstanding", result);

  const last = schedule[schedule.length - 1]!;
  assert(last.closingPrincipal === 0, `Final outstanding should be 0, got ${last.closingPrincipal}`, result);
  const totalPrincipal = roundMoney(schedule.reduce((s, row) => s + row.principalDue, 0));
  assert(Math.abs(totalPrincipal - principal) < 1, `Principal recovered, got ${totalPrincipal}`, result);

  const remainingAfter10 = schedule[9]!.closingPrincipal;
  const prepaid = 500_000;
  const afterPrepay = remainingAfter10 - prepaid;
  const remainingN = 50;
  const newEmi = calculateReducingEmi(afterPrepay, r, remainingN);
  assert(newEmi > 0 && newEmi < emi, "Reduce-EMI after prepayment lowers EMI", result);
  const reducedTenure = generateLoanSchedule({
    principal: afterPrepay,
    interestRate: annualRate,
    interestMethod: "reducing_balance",
    tenure: 40,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    disbursementDate: "2027-06-01",
    firstPaymentDate: "2027-07-01",
    emiAmount: emi,
    emiIsManual: true,
  });
  assert(reducedTenure[reducedTenure.length - 1]!.closingPrincipal === 0, "Reduce-tenure schedule still closes", result);

  const rateUp = generateLoanSchedule({
    principal: remainingAfter10,
    interestRate: 11.25,
    interestMethod: "reducing_balance",
    tenure: 50,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    disbursementDate: "2027-06-01",
    firstPaymentDate: "2027-07-01",
  });
  assert(rateUp[0]!.interestDue > schedule[10]!.interestDue, "Higher rate increases future interest", result);

  const partialLeft = roundMoney(first.totalDue - 60_000);
  assert(partialLeft > 0, "Partial payment leaves remainder", result);

  const flat = generateLoanSchedule({
    principal,
    interestRate: annualRate,
    interestMethod: "flat_rate",
    tenure: 60,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    disbursementDate: "2026-08-01",
    firstPaymentDate: "2026-09-01",
  });
  assert(flat.every((row) => Math.abs(row.interestDue - flat[0]!.interestDue) < 1 || row.installmentNumber === 60), "Flat interest mostly equal", result);

  const simple = generateLoanSchedule({
    principal,
    interestRate: annualRate,
    interestMethod: "simple_interest",
    tenure: 12,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    disbursementDate: "2026-08-01",
    firstPaymentDate: "2026-09-01",
  });
  assert(simple.length === 12, "Simple interest 12 rows", result);

  const compound = generateLoanSchedule({
    principal: 100_000,
    interestRate: 12,
    interestMethod: "compound_interest",
    tenure: 12,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    disbursementDate: "2026-01-01",
    firstPaymentDate: "2026-02-01",
  });
  assert(compound[compound.length - 1]!.closingPrincipal === 0, "Compound schedule closes", result);

  const daily = generateLoanSchedule({
    principal: 100_000,
    interestRate: 12,
    interestMethod: "daily_reducing_balance",
    tenure: 12,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    dayBasis: 365,
    disbursementDate: "2026-01-01",
    firstPaymentDate: "2026-02-01",
  });
  assert(daily[0]!.interestDue > 0, "Daily reducing interest uses day count", result);

  const daily360 = generateLoanSchedule({
    principal: 100_000,
    interestRate: 12,
    interestMethod: "daily_reducing_balance",
    tenure: 12,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    dayBasis: 360,
    disbursementDate: "2026-01-01",
    firstPaymentDate: "2026-02-01",
  });
  const daily366 = generateLoanSchedule({
    principal: 100_000,
    interestRate: 12,
    interestMethod: "daily_reducing_balance",
    tenure: 12,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    dayBasis: 366,
    disbursementDate: "2026-01-01",
    firstPaymentDate: "2026-02-01",
  });
  assert(daily360[0]!.interestDue > daily[0]!.interestDue, "360-day basis yields more interest than 365", result);
  assert(daily366[0]!.interestDue < daily[0]!.interestDue, "366-day basis yields less interest than 365", result);
  assert(
    dailyInterest(100_000, 12, 31, 360) !== dailyInterest(100_000, 12, 31, 365),
    "Daily interest 360 vs 365 differs",
    result
  );

  const apr = generateDueDates({
    firstPaymentDate: "2026-04-30",
    installmentCount: 3,
    frequency: "monthly",
    paymentDayMode: "same_day",
  });
  assert(apr[0] === "2026-04-30" && apr[1] === "2026-05-30" && apr[2] === "2026-06-30", `30-Apr clamp, got ${apr.join(",")}`, result);

  const may = generateDueDates({
    firstPaymentDate: "2026-05-31",
    installmentCount: 3,
    frequency: "monthly",
    paymentDayMode: "same_day",
  });
  assert(may[1] === "2026-06-30" && may[2] === "2026-07-31", `31-May clamp, got ${may.join(",")}`, result);

  const dec = generateDueDates({
    firstPaymentDate: "2026-12-31",
    installmentCount: 2,
    frequency: "monthly",
    paymentDayMode: "same_day",
  });
  assert(dec[1] === "2027-01-31", `31-Dec next, got ${dec[1]}`, result);

  const jan = generateDueDates({
    firstPaymentDate: "2026-01-01",
    installmentCount: 2,
    frequency: "monthly",
    paymentDayMode: "same_day",
  });
  assert(jan[0] === "2026-01-01" && jan[1] === "2026-02-01", "01-Jan monthly", result);

  const q = generateDueDates({
    firstPaymentDate: "2026-01-31",
    installmentCount: 4,
    frequency: "quarterly",
    paymentDayMode: "same_day",
  });
  assert(q[1] === "2026-04-30" && q[2] === "2026-07-31" && q[3] === "2026-10-31", `Quarterly clamp, got ${q.join(",")}`, result);

  const hy = generateDueDates({
    firstPaymentDate: "2026-01-31",
    installmentCount: 3,
    frequency: "half_yearly",
    paymentDayMode: "same_day",
  });
  assert(hy[1] === "2026-07-31" && hy[2] === "2027-01-31", `Half-yearly, got ${hy.join(",")}`, result);

  const yr = generateDueDates({
    firstPaymentDate: "2026-02-28",
    installmentCount: 2,
    frequency: "yearly",
    paymentDayMode: "same_day",
  });
  assert(yr[1] === "2027-02-28", `Yearly 28-Feb, got ${yr[1]}`, result);

  const parsed = parseIsoDate("2026-09-01");
  assert(formatIsoDate(parsed) === "2026-09-01", "ISO parse/format does not shift 2026-09-01", result);
  assert(parsed.getHours() === 12, "Parse uses local noon to avoid UTC day shift", result);

  assert(first.interestDue === 43_750, `First interest should be 43,750, got ${first.interestDue}`, result);
  const firstPrincipal = roundMoney(emi - 43_750);
  assert(first.principalDue === firstPrincipal, `First principal = EMI − interest, got ${first.principalDue}`, result);
  assert(first.closingPrincipal === roundMoney(principal - first.principalDue), "Closing = opening − principal", result);

  assert(flat[10]!.interestDue === flat[0]!.interestDue || flat[10]!.installmentNumber === 60, "Flat mid interest stays level", result);
  assert(schedule[10]!.interestDue < first.interestDue, "Reducing interest falls after principal is paid", result);
  assert(simple[0]!.interestDue > 0, "Simple interest first row has interest", result);
  assert(compound[0]!.interestDue > 0, "Compound first row has interest", result);

  const quarterlyLoan = {
    id: "t",
    companyId: "c",
    interestMethod: "reducing_balance",
    paymentFrequency: "quarterly",
    customIntervalMonths: 1,
    disbursementDate: "2026-01-01",
    paymentDayMode: "same_day",
    paymentDay: 1,
    dayBasis: 365,
    compoundingFrequency: "quarterly",
    emiAmount: 0,
    emiIsManual: false,
    scheduleVersion: 1,
    interestRate: 10.5,
  } as unknown as Loan;
  const regenQ = regenerateFutureSchedule({
    loan: quarterlyLoan,
    paidRows: [],
    outstandingPrincipal: 5_000_000,
    interestRate: 10.5,
    remainingCount: 20,
    firstFutureDate: "2026-04-01",
  });
  assert(regenQ.length === 20, `Quarterly regen must keep 20 installments, got ${regenQ.length}`, result);

  const interestOnly = generateLoanSchedule({
    principal: 1_000_000,
    interestRate: 12,
    interestMethod: "reducing_balance",
    tenure: 12,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    disbursementDate: "2026-01-01",
    firstPaymentDate: "2026-02-01",
    repaymentType: "interest_only",
  });
  assert(interestOnly.length === 12, "Interest-only has 12 installments", result);
  assert(interestOnly[0]!.principalDue === 0, "Interest-only first row has no principal", result);
  assert(interestOnly[0]!.interestDue > 0, "Interest-only first row has interest", result);
  assert(
    interestOnly[0]!.closingPrincipal === interestOnly[0]!.openingPrincipal,
    "Interest-only keeps principal until prepay/close",
    result
  );
  assert(interestOnly[11]!.principalDue === 0, "Interest-only last row still no scheduled principal", result);

  const bullet = generateLoanSchedule({
    principal: 500_000,
    interestRate: 10,
    interestMethod: "reducing_balance",
    tenure: 6,
    tenureUnit: "months",
    paymentFrequency: "monthly",
    disbursementDate: "2026-01-01",
    firstPaymentDate: "2026-02-01",
    repaymentType: "bullet",
  });
  assert(bullet.length === 6, "Bullet has 6 installments", result);
  assert(bullet[4]!.principalDue === 0, "Bullet mid rows are interest only", result);
  assert(bullet[5]!.principalDue === 500_000, "Bullet last row pays full principal", result);
  assert(bullet[5]!.closingPrincipal === 0, "Bullet closes on maturity", result);

  return result;
}

const isDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.some((a) => String(a).includes("loanCalculation.selftest"));

if (isDirectRun) {
  const out = runLoanCalculationSelfTests();
  if (out.failed.length) {
    console.error(`FAILED ${out.failed.length}:`);
    for (const f of out.failed) console.error(" -", f);
    process.exitCode = 1;
  } else {
    console.log(`Loan calculation tests passed (${out.passed}).`);
  }
}
