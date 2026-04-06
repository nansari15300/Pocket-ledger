/**
 * Master `/incomes` page par pathname sirf `/incomes` hota hai (`?selected=` se detail).
 * `pathname.replace(/\/[^/]+$/, "")` yahan poora path uda deta hai → `/${id}` → galat route → /company redirect.
 */
function trimPath(pathname: string) {
  return (pathname || "").replace(/\/+$/, "") || "/";
}

/** Account dropdown: query-nav jaisa URL banaye ya `/incomes/[id]` segment replace kare */
export function pushIncomeExpenseAccountSwitch(
  router: { push: (href: string) => void },
  pathname: string,
  nextAccountId: string
) {
  const id = encodeURIComponent(nextAccountId);
  const pathTrim = trimPath(pathname);
  if (pathTrim === "/incomes") {
    router.push(`/incomes?selected=${id}`);
    return;
  }
  const parent = pathTrim.replace(/\/[^/]+$/, "");
  router.push(parent && parent !== pathTrim ? `${parent}/${id}` : `/incomes/${id}`);
}

/** Group dropdown: `?view=groups&selected=` ya `/incomes/group/[id]` */
export function pushIncomeExpenseGroupSwitch(
  router: { push: (href: string) => void },
  pathname: string,
  nextGroupId: string
) {
  const id = encodeURIComponent(nextGroupId);
  const pathTrim = trimPath(pathname);
  if (pathTrim === "/incomes") {
    router.push(`/incomes?view=groups&selected=${id}`);
    return;
  }
  const parent = pathTrim.replace(/\/[^/]+$/, "");
  router.push(parent && parent !== pathTrim ? `${parent}/${id}` : `/incomes/group/${id}`);
}
