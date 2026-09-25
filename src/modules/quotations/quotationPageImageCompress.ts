import { compressVoucherAttachment } from "@/lib/compression";

/** Quotation letter inline pictures — fixed cap (not plan band). */
export const QUOTATION_PAGE_IMAGE_MAX_BYTES = 150 * 1024;

export async function compressQuotationPageImageFile(file: File): Promise<File> {
  return compressVoucherAttachment(file, QUOTATION_PAGE_IMAGE_MAX_BYTES);
}

export async function compressQuotationPageImageDataUrl(file: File): Promise<string> {
  const compressed = await compressQuotationPageImageFile(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read compressed image"));
    reader.readAsDataURL(compressed);
  });
}
