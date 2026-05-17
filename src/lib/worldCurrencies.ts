import { countries } from "@/lib/countries";
import { isInternationalBillingCountry, isSaarcBillingCountry } from "@/lib/billingRegions";

/** One row per country — billing/company dropdown + default symbol when country changes. */
export type CountryCurrencyRow = {
  country: string;
  currencyCode: string;
  currencyName: string;
  symbol: string;
};

/**
 * Primary ISO 4217 currency per country (countries.ts list).
 * Euro-area / CFA / East Caribbean share one code — symbol matches common local display.
 */
const COUNTRY_CURRENCY_OVERRIDES: Record<
  string,
  { currencyCode: string; currencyName: string; symbol: string }
> = {
  Afghanistan: { currencyCode: "AFN", currencyName: "Afghan Afghani", symbol: "؋" },
  Albania: { currencyCode: "ALL", currencyName: "Albanian Lek", symbol: "L" },
  Algeria: { currencyCode: "DZD", currencyName: "Algerian Dinar", symbol: "د.ج" },
  Andorra: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Angola: { currencyCode: "AOA", currencyName: "Angolan Kwanza", symbol: "Kz" },
  "Antigua and Barbuda": { currencyCode: "XCD", currencyName: "East Caribbean Dollar", symbol: "$" },
  Argentina: { currencyCode: "ARS", currencyName: "Argentine Peso", symbol: "$" },
  Armenia: { currencyCode: "AMD", currencyName: "Armenian Dram", symbol: "֏" },
  Australia: { currencyCode: "AUD", currencyName: "Australian Dollar", symbol: "A$" },
  Austria: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Azerbaijan: { currencyCode: "AZN", currencyName: "Azerbaijani Manat", symbol: "₼" },
  Bahamas: { currencyCode: "BSD", currencyName: "Bahamian Dollar", symbol: "$" },
  Bahrain: { currencyCode: "BHD", currencyName: "Bahraini Dinar", symbol: ".د.ب" },
  Bangladesh: { currencyCode: "BDT", currencyName: "Bangladeshi Taka", symbol: "৳" },
  Barbados: { currencyCode: "BBD", currencyName: "Barbadian Dollar", symbol: "$" },
  Belarus: { currencyCode: "BYN", currencyName: "Belarusian Ruble", symbol: "Br" },
  Belgium: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Belize: { currencyCode: "BZD", currencyName: "Belize Dollar", symbol: "BZ$" },
  Benin: { currencyCode: "XOF", currencyName: "West African CFA Franc", symbol: "CFA" },
  Bhutan: { currencyCode: "BTN", currencyName: "Bhutanese Ngultrum", symbol: "Nu." },
  Bolivia: { currencyCode: "BOB", currencyName: "Bolivian Boliviano", symbol: "Bs." },
  "Bosnia and Herzegovina": { currencyCode: "BAM", currencyName: "Bosnia-Herzegovina Convertible Mark", symbol: "KM" },
  Botswana: { currencyCode: "BWP", currencyName: "Botswana Pula", symbol: "P" },
  Brazil: { currencyCode: "BRL", currencyName: "Brazilian Real", symbol: "R$" },
  Brunei: { currencyCode: "BND", currencyName: "Brunei Dollar", symbol: "B$" },
  Bulgaria: { currencyCode: "BGN", currencyName: "Bulgarian Lev", symbol: "лв" },
  "Burkina Faso": { currencyCode: "XOF", currencyName: "West African CFA Franc", symbol: "CFA" },
  Burundi: { currencyCode: "BIF", currencyName: "Burundian Franc", symbol: "FBu" },
  "Cabo Verde": { currencyCode: "CVE", currencyName: "Cape Verdean Escudo", symbol: "$" },
  Cambodia: { currencyCode: "KHR", currencyName: "Cambodian Riel", symbol: "៛" },
  Cameroon: { currencyCode: "XAF", currencyName: "Central African CFA Franc", symbol: "FCFA" },
  Canada: { currencyCode: "CAD", currencyName: "Canadian Dollar", symbol: "C$" },
  "Central African Republic": { currencyCode: "XAF", currencyName: "Central African CFA Franc", symbol: "FCFA" },
  Chad: { currencyCode: "XAF", currencyName: "Central African CFA Franc", symbol: "FCFA" },
  Chile: { currencyCode: "CLP", currencyName: "Chilean Peso", symbol: "$" },
  China: { currencyCode: "CNY", currencyName: "Chinese Yuan", symbol: "¥" },
  Colombia: { currencyCode: "COP", currencyName: "Colombian Peso", symbol: "$" },
  Comoros: { currencyCode: "KMF", currencyName: "Comorian Franc", symbol: "CF" },
  Congo: { currencyCode: "XAF", currencyName: "Central African CFA Franc", symbol: "FCFA" },
  "Costa Rica": { currencyCode: "CRC", currencyName: "Costa Rican Colón", symbol: "₡" },
  Croatia: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Cuba: { currencyCode: "CUP", currencyName: "Cuban Peso", symbol: "$" },
  Cyprus: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  "Czech Republic": { currencyCode: "CZK", currencyName: "Czech Koruna", symbol: "Kč" },
  Denmark: { currencyCode: "DKK", currencyName: "Danish Krone", symbol: "kr" },
  Djibouti: { currencyCode: "DJF", currencyName: "Djiboutian Franc", symbol: "Fdj" },
  Dominica: { currencyCode: "XCD", currencyName: "East Caribbean Dollar", symbol: "$" },
  "Dominican Republic": { currencyCode: "DOP", currencyName: "Dominican Peso", symbol: "RD$" },
  Ecuador: { currencyCode: "USD", currencyName: "US Dollar", symbol: "$" },
  Egypt: { currencyCode: "EGP", currencyName: "Egyptian Pound", symbol: "E£" },
  "El Salvador": { currencyCode: "USD", currencyName: "US Dollar", symbol: "$" },
  "Equatorial Guinea": { currencyCode: "XAF", currencyName: "Central African CFA Franc", symbol: "FCFA" },
  Eritrea: { currencyCode: "ERN", currencyName: "Eritrean Nakfa", symbol: "Nfk" },
  Estonia: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Eswatini: { currencyCode: "SZL", currencyName: "Swazi Lilangeni", symbol: "E" },
  Ethiopia: { currencyCode: "ETB", currencyName: "Ethiopian Birr", symbol: "Br" },
  Fiji: { currencyCode: "FJD", currencyName: "Fijian Dollar", symbol: "FJ$" },
  Finland: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  France: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Gabon: { currencyCode: "XAF", currencyName: "Central African CFA Franc", symbol: "FCFA" },
  Gambia: { currencyCode: "GMD", currencyName: "Gambian Dalasi", symbol: "D" },
  Georgia: { currencyCode: "GEL", currencyName: "Georgian Lari", symbol: "₾" },
  Germany: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Ghana: { currencyCode: "GHS", currencyName: "Ghanaian Cedi", symbol: "₵" },
  Greece: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Grenada: { currencyCode: "XCD", currencyName: "East Caribbean Dollar", symbol: "$" },
  Guatemala: { currencyCode: "GTQ", currencyName: "Guatemalan Quetzal", symbol: "Q" },
  Guinea: { currencyCode: "GNF", currencyName: "Guinean Franc", symbol: "FG" },
  "Guinea-Bissau": { currencyCode: "XOF", currencyName: "West African CFA Franc", symbol: "CFA" },
  Guyana: { currencyCode: "GYD", currencyName: "Guyanese Dollar", symbol: "G$" },
  Haiti: { currencyCode: "HTG", currencyName: "Haitian Gourde", symbol: "G" },
  Honduras: { currencyCode: "HNL", currencyName: "Honduran Lempira", symbol: "L" },
  Hungary: { currencyCode: "HUF", currencyName: "Hungarian Forint", symbol: "Ft" },
  Iceland: { currencyCode: "ISK", currencyName: "Icelandic Króna", symbol: "kr" },
  India: { currencyCode: "INR", currencyName: "Indian Rupee", symbol: "₹" },
  Indonesia: { currencyCode: "IDR", currencyName: "Indonesian Rupiah", symbol: "Rp" },
  Iran: { currencyCode: "IRR", currencyName: "Iranian Rial", symbol: "﷼" },
  Iraq: { currencyCode: "IQD", currencyName: "Iraqi Dinar", symbol: "ع.د" },
  Ireland: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Israel: { currencyCode: "ILS", currencyName: "Israeli New Shekel", symbol: "₪" },
  Italy: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Jamaica: { currencyCode: "JMD", currencyName: "Jamaican Dollar", symbol: "J$" },
  Japan: { currencyCode: "JPY", currencyName: "Japanese Yen", symbol: "¥" },
  Jordan: { currencyCode: "JOD", currencyName: "Jordanian Dinar", symbol: "JD" },
  Kazakhstan: { currencyCode: "KZT", currencyName: "Kazakhstani Tenge", symbol: "₸" },
  Kenya: { currencyCode: "KES", currencyName: "Kenyan Shilling", symbol: "KSh" },
  Kiribati: { currencyCode: "AUD", currencyName: "Australian Dollar", symbol: "A$" },
  "Korea, North": { currencyCode: "KPW", currencyName: "North Korean Won", symbol: "₩" },
  "Korea, South": { currencyCode: "KRW", currencyName: "South Korean Won", symbol: "₩" },
  Kuwait: { currencyCode: "KWD", currencyName: "Kuwaiti Dinar", symbol: "د.ك" },
  Kyrgyzstan: { currencyCode: "KGS", currencyName: "Kyrgyzstani Som", symbol: "с" },
  Laos: { currencyCode: "LAK", currencyName: "Lao Kip", symbol: "₭" },
  Latvia: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Lebanon: { currencyCode: "LBP", currencyName: "Lebanese Pound", symbol: "ل.ل" },
  Lesotho: { currencyCode: "LSL", currencyName: "Lesotho Loti", symbol: "L" },
  Liberia: { currencyCode: "LRD", currencyName: "Liberian Dollar", symbol: "$" },
  Libya: { currencyCode: "LYD", currencyName: "Libyan Dinar", symbol: "ل.د" },
  Liechtenstein: { currencyCode: "CHF", currencyName: "Swiss Franc", symbol: "CHF" },
  Lithuania: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Luxembourg: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Madagascar: { currencyCode: "MGA", currencyName: "Malagasy Ariary", symbol: "Ar" },
  Malawi: { currencyCode: "MWK", currencyName: "Malawian Kwacha", symbol: "MK" },
  Malaysia: { currencyCode: "MYR", currencyName: "Malaysian Ringgit", symbol: "RM" },
  Maldives: { currencyCode: "MVR", currencyName: "Maldivian Rufiyaa", symbol: "Rf" },
  Mali: { currencyCode: "XOF", currencyName: "West African CFA Franc", symbol: "CFA" },
  Malta: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  "Marshall Islands": { currencyCode: "USD", currencyName: "US Dollar", symbol: "$" },
  Mauritania: { currencyCode: "MRU", currencyName: "Mauritanian Ouguiya", symbol: "UM" },
  Mauritius: { currencyCode: "MUR", currencyName: "Mauritian Rupee", symbol: "₨" },
  Mexico: { currencyCode: "MXN", currencyName: "Mexican Peso", symbol: "$" },
  Micronesia: { currencyCode: "USD", currencyName: "US Dollar", symbol: "$" },
  Moldova: { currencyCode: "MDL", currencyName: "Moldovan Leu", symbol: "L" },
  Monaco: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Mongolia: { currencyCode: "MNT", currencyName: "Mongolian Tögrög", symbol: "₮" },
  Montenegro: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Morocco: { currencyCode: "MAD", currencyName: "Moroccan Dirham", symbol: "د.م." },
  Mozambique: { currencyCode: "MZN", currencyName: "Mozambican Metical", symbol: "MT" },
  Myanmar: { currencyCode: "MMK", currencyName: "Myanmar Kyat", symbol: "K" },
  Namibia: { currencyCode: "NAD", currencyName: "Namibian Dollar", symbol: "N$" },
  Nauru: { currencyCode: "AUD", currencyName: "Australian Dollar", symbol: "A$" },
  Nepal: { currencyCode: "NPR", currencyName: "Nepalese Rupee", symbol: "Rs." },
  Netherlands: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  "New Zealand": { currencyCode: "NZD", currencyName: "New Zealand Dollar", symbol: "NZ$" },
  Nicaragua: { currencyCode: "NIO", currencyName: "Nicaraguan Córdoba", symbol: "C$" },
  Niger: { currencyCode: "XOF", currencyName: "West African CFA Franc", symbol: "CFA" },
  Nigeria: { currencyCode: "NGN", currencyName: "Nigerian Naira", symbol: "₦" },
  "North Macedonia": { currencyCode: "MKD", currencyName: "Macedonian Denar", symbol: "ден" },
  Norway: { currencyCode: "NOK", currencyName: "Norwegian Krone", symbol: "kr" },
  Oman: { currencyCode: "OMR", currencyName: "Omani Rial", symbol: "ر.ع." },
  Pakistan: { currencyCode: "PKR", currencyName: "Pakistani Rupee", symbol: "₨" },
  Palau: { currencyCode: "USD", currencyName: "US Dollar", symbol: "$" },
  Palestine: { currencyCode: "ILS", currencyName: "Israeli New Shekel", symbol: "₪" },
  Panama: { currencyCode: "PAB", currencyName: "Panamanian Balboa", symbol: "B/." },
  "Papua New Guinea": { currencyCode: "PGK", currencyName: "Papua New Guinean Kina", symbol: "K" },
  Paraguay: { currencyCode: "PYG", currencyName: "Paraguayan Guaraní", symbol: "₲" },
  Peru: { currencyCode: "PEN", currencyName: "Peruvian Sol", symbol: "S/" },
  Philippines: { currencyCode: "PHP", currencyName: "Philippine Peso", symbol: "₱" },
  Poland: { currencyCode: "PLN", currencyName: "Polish Złoty", symbol: "zł" },
  Portugal: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Qatar: { currencyCode: "QAR", currencyName: "Qatari Riyal", symbol: "ر.ق" },
  Romania: { currencyCode: "RON", currencyName: "Romanian Leu", symbol: "lei" },
  Russia: { currencyCode: "RUB", currencyName: "Russian Ruble", symbol: "₽" },
  Rwanda: { currencyCode: "RWF", currencyName: "Rwandan Franc", symbol: "FRw" },
  "Saint Kitts and Nevis": { currencyCode: "XCD", currencyName: "East Caribbean Dollar", symbol: "$" },
  "Saint Lucia": { currencyCode: "XCD", currencyName: "East Caribbean Dollar", symbol: "$" },
  "Saint Vincent and the Grenadines": { currencyCode: "XCD", currencyName: "East Caribbean Dollar", symbol: "$" },
  Samoa: { currencyCode: "WST", currencyName: "Samoan Tālā", symbol: "T" },
  "San Marino": { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  "Sao Tome and Principe": { currencyCode: "STN", currencyName: "São Tomé and Príncipe Dobra", symbol: "Db" },
  "Saudi Arabia": { currencyCode: "SAR", currencyName: "Saudi Riyal", symbol: "ر.س" },
  Senegal: { currencyCode: "XOF", currencyName: "West African CFA Franc", symbol: "CFA" },
  Serbia: { currencyCode: "RSD", currencyName: "Serbian Dinar", symbol: "дин." },
  Seychelles: { currencyCode: "SCR", currencyName: "Seychellois Rupee", symbol: "₨" },
  "Sierra Leone": { currencyCode: "SLE", currencyName: "Sierra Leonean Leone", symbol: "Le" },
  Singapore: { currencyCode: "SGD", currencyName: "Singapore Dollar", symbol: "S$" },
  Slovakia: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Slovenia: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  "Solomon Islands": { currencyCode: "SBD", currencyName: "Solomon Islands Dollar", symbol: "SI$" },
  Somalia: { currencyCode: "SOS", currencyName: "Somali Shilling", symbol: "Sh" },
  "South Africa": { currencyCode: "ZAR", currencyName: "South African Rand", symbol: "R" },
  "South Sudan": { currencyCode: "SSP", currencyName: "South Sudanese Pound", symbol: "£" },
  Spain: { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  "Sri Lanka": { currencyCode: "LKR", currencyName: "Sri Lankan Rupee", symbol: "Rs" },
  Sudan: { currencyCode: "SDG", currencyName: "Sudanese Pound", symbol: "ج.س." },
  Suriname: { currencyCode: "SRD", currencyName: "Surinamese Dollar", symbol: "$" },
  Sweden: { currencyCode: "SEK", currencyName: "Swedish Krona", symbol: "kr" },
  Switzerland: { currencyCode: "CHF", currencyName: "Swiss Franc", symbol: "CHF" },
  Syria: { currencyCode: "SYP", currencyName: "Syrian Pound", symbol: "£" },
  Taiwan: { currencyCode: "TWD", currencyName: "New Taiwan Dollar", symbol: "NT$" },
  Tajikistan: { currencyCode: "TJS", currencyName: "Tajikistani Somoni", symbol: "ЅМ" },
  Tanzania: { currencyCode: "TZS", currencyName: "Tanzanian Shilling", symbol: "TSh" },
  Thailand: { currencyCode: "THB", currencyName: "Thai Baht", symbol: "฿" },
  "Timor-Leste": { currencyCode: "USD", currencyName: "US Dollar", symbol: "$" },
  Togo: { currencyCode: "XOF", currencyName: "West African CFA Franc", symbol: "CFA" },
  Tonga: { currencyCode: "TOP", currencyName: "Tongan Paʻanga", symbol: "T$" },
  "Trinidad and Tobago": { currencyCode: "TTD", currencyName: "Trinidad and Tobago Dollar", symbol: "TT$" },
  Tunisia: { currencyCode: "TND", currencyName: "Tunisian Dinar", symbol: "د.ت" },
  Turkey: { currencyCode: "TRY", currencyName: "Turkish Lira", symbol: "₺" },
  Turkmenistan: { currencyCode: "TMT", currencyName: "Turkmenistani Manat", symbol: "m" },
  Tuvalu: { currencyCode: "AUD", currencyName: "Australian Dollar", symbol: "A$" },
  Uganda: { currencyCode: "UGX", currencyName: "Ugandan Shilling", symbol: "USh" },
  Ukraine: { currencyCode: "UAH", currencyName: "Ukrainian Hryvnia", symbol: "₴" },
  "United Arab Emirates": { currencyCode: "AED", currencyName: "UAE Dirham", symbol: "د.إ" },
  "United Kingdom": { currencyCode: "GBP", currencyName: "British Pound", symbol: "£" },
  "United States": { currencyCode: "USD", currencyName: "US Dollar", symbol: "$" },
  Uruguay: { currencyCode: "UYU", currencyName: "Uruguayan Peso", symbol: "$U" },
  Uzbekistan: { currencyCode: "UZS", currencyName: "Uzbekistani Som", symbol: "so'm" },
  Vanuatu: { currencyCode: "VUV", currencyName: "Vanuatu Vatu", symbol: "VT" },
  "Vatican City": { currencyCode: "EUR", currencyName: "Euro", symbol: "€" },
  Venezuela: { currencyCode: "VES", currencyName: "Venezuelan Bolívar", symbol: "Bs." },
  Vietnam: { currencyCode: "VND", currencyName: "Vietnamese Đồng", symbol: "₫" },
  Yemen: { currencyCode: "YER", currencyName: "Yemeni Rial", symbol: "﷼" },
  Zambia: { currencyCode: "ZMW", currencyName: "Zambian Kwacha", symbol: "ZK" },
  Zimbabwe: { currencyCode: "ZWL", currencyName: "Zimbabwean Dollar", symbol: "$" },
};

const FALLBACK_ROW: Omit<CountryCurrencyRow, "country"> = {
  currencyCode: "USD",
  currencyName: "US Dollar",
  symbol: "$",
};

/** ISO code → display symbol (billing plan.currency jab company symbol na ho). */
const CODE_TO_SYMBOL: Record<string, string> = {};

for (const row of Object.values(COUNTRY_CURRENCY_OVERRIDES)) {
  CODE_TO_SYMBOL[row.currencyCode] = row.symbol;
}
CODE_TO_SYMBOL.NPR = "Rs.";

/** Har countries.ts naam ke liye ek row — dropdown + default on country change. */
export const COUNTRY_CURRENCY_ROWS: CountryCurrencyRow[] = countries.map((country) => {
  const o = COUNTRY_CURRENCY_OVERRIDES[country] ?? FALLBACK_ROW;
  return { country, ...o };
});

export function getDefaultCurrencyForCountry(country?: string | null): CountryCurrencyRow {
  const name = String(country ?? "").trim();
  if (!name) {
    return { country: "Nepal", ...COUNTRY_CURRENCY_OVERRIDES.Nepal };
  }
  const hit = COUNTRY_CURRENCY_ROWS.find((r) => r.country === name);
  if (hit) return hit;
  const o = COUNTRY_CURRENCY_OVERRIDES[name] ?? FALLBACK_ROW;
  return { country: name, ...o };
}

export function getCurrencySymbolForCode(code?: string | null): string {
  const c = String(code ?? "").trim().toUpperCase();
  if (!c) return "Rs.";
  return CODE_TO_SYMBOL[c] ?? c;
}

/** Combobox: value = country (search filters country + code + name). */
/** Company load: currency dropdown value (country name) — saved code se match ya company.country. */
export function resolveCurrencyCountryKey(company?: {
  country?: string | null;
  currencyCode?: string | null;
} | null): string {
  const country = String(company?.country ?? "").trim();
  if (country) return country;
  const code = String(company?.currencyCode ?? "").trim().toUpperCase();
  if (code) {
    const hit = COUNTRY_CURRENCY_ROWS.find((r) => r.currencyCode === code);
    if (hit) return hit.country;
  }
  return "Nepal";
}

export function buildCountryCurrencyComboboxOptions(): {
  value: string;
  label: string;
  triggerLabel?: string;
}[] {
  return COUNTRY_CURRENCY_ROWS.map((r) => ({
    value: r.country,
    label: `${r.country} — ${r.currencyCode} (${r.symbol})`,
    triggerLabel: `${r.currencyCode} (${r.symbol})`,
  }));
}

type CountrySearchOption = { value: string; label: string; triggerLabel?: string };

function mapCountrySearchRow(r: CountryCurrencyRow, symbolWithOne: boolean): CountrySearchOption {
  return {
    value: r.country,
    label: r.country,
    triggerLabel: symbolWithOne ? `${r.country} · ${r.symbol} 1` : `${r.country} · ${r.symbol}`,
  };
}

/** Saari countries — sirf country name search (admin base country picker). */
export function buildCountrySearchComboboxOptions(symbolWithOne = true): CountrySearchOption[] {
  return COUNTRY_CURRENCY_ROWS.map((r) => mapCountrySearchRow(r, symbolWithOne));
}

/** SAARC members only — admin FX SAARC card dropdown. */
export function buildSaarcCountrySearchOptions(): CountrySearchOption[] {
  return COUNTRY_CURRENCY_ROWS.filter((r) => isSaarcBillingCountry(r.country)).map((r) =>
    mapCountrySearchRow(r, false)
  );
}

/** Nepal + SAARC chhod kar — admin FX International card dropdown. */
export function buildInternationalCountrySearchOptions(): CountrySearchOption[] {
  return COUNTRY_CURRENCY_ROWS.filter((r) => isInternationalBillingCountry(r.country)).map((r) =>
    mapCountrySearchRow(r, false)
  );
}
