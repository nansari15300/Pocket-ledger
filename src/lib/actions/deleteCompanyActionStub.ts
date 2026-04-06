/**
 * Stub for static export - delete/restore not available in app mode.
 */
export async function restoreCompany(_companyId: string) {
  return { success: false, error: "Restore not available in app mode. Use web version." };
}

export async function deleteCompanyComplete(_companyId: string, _userId: string) {
  return { success: false, error: "Company deletion not available in app mode. Use web version." };
}
