"use client";

import { ref, uploadBytes, getDownloadURL, deleteObject, getBlob } from "firebase/storage";
import { storage } from "./firebase";
import { format } from "date-fns";

const slugify = (text: string = "") =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

<<<<<<< HEAD
const safeFileName = (name: string) =>
  name
=======
const safeFileName = (name: string | undefined) =>
  (name ?? "")
>>>>>>> 6a1ec26 (Animation Fixed)
    .trim()
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);

const getCompanyFolder = (companyId: string, companyName?: string) => {
  if (!companyName) return companyId;
  return `${companyId}__${slugify(companyName)}`;
};

const generateVoucherPath = (
  companyId: string,
  companyName: string | undefined,
  voucherType: string,
  voucherDate: Date,
  voucherId: string,
<<<<<<< HEAD
  fileName: string
=======
  fileName: string | undefined
>>>>>>> 6a1ec26 (Animation Fixed)
) => {
  const year = format(voucherDate, "yyyy");
  const month = format(voucherDate, "MM");
  const day = format(voucherDate, "yyyy-MM-dd");
  const companyKey = getCompanyFolder(companyId, companyName);
  const uniqueName = `${Date.now()}_${safeFileName(fileName)}`;
  return `companies/${companyKey}/vouchers/${voucherType}/${year}/${month}/${day}/${voucherId}/${uniqueName}`;
};

/**
 * Client-only: Move files to voucher date folder. Runs in browser so Storage uses signed-in user auth (server action has no auth).
 */
export async function moveFilesToVoucherDateClient({
  companyId,
  companyName,
  voucherType,
  voucherDate,
  voucherId,
  files,
}: {
  companyId: string;
  companyName: string | undefined;
  voucherType: string;
  voucherDate: Date;
  voucherId: string;
  files: { oldPath: string; fileName: string }[];
}) {
  const movePromises = files.map(async (file) => {
    try {
      const newPath = generateVoucherPath(companyId, companyName, voucherType, voucherDate, voucherId, file.fileName);
      const oldFileRef = ref(storage, file.oldPath);
      const newFileRef = ref(storage, newPath);
      const blob = await getBlob(oldFileRef);
      await uploadBytes(newFileRef, blob);
      const newUrl = await getDownloadURL(newFileRef);
      await deleteObject(oldFileRef);
      return { oldPath: file.oldPath, newPath, url: newUrl, success: true };
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`Failed to move file from ${file.oldPath}:`, error);
      try {
        const oldUrl = await getDownloadURL(ref(storage, file.oldPath));
        return { oldPath: file.oldPath, newPath: file.oldPath, url: oldUrl, success: false, error: err?.message };
      } catch {
        return { oldPath: file.oldPath, newPath: file.oldPath, url: "", success: false, error: "Failed to move and could not retrieve original URL." };
      }
    }
  });
  const movedFiles = await Promise.all(movePromises);
  return { success: true, moved: movedFiles };
}
