/**
 * compressFile() se pehle max raw image size — purana 5MB mobile par bade photos reject karta tha.
 * createImageBitmap resize se ab bada file bhi decode ho sakta hai (PC jaisa behaviour).
 */
export const MAX_IMAGE_MB_BEFORE_COMPRESS = 25;
export const MAX_IMAGE_BYTES_BEFORE_COMPRESS = MAX_IMAGE_MB_BEFORE_COMPRESS * 1024 * 1024;

/** compressFile() ke baad bhi is se bada ho to reject — item/party attachments */
export const MAX_IMAGE_MB_AFTER_COMPRESS = 5;
export const MAX_IMAGE_BYTES_AFTER_COMPRESS = MAX_IMAGE_MB_AFTER_COMPRESS * 1024 * 1024;

/** PDF upload (compress nahi hota) — pehle size check */
export const MAX_PDF_UPLOAD_MB = 15;
export const MAX_PDF_BYTES_BEFORE_UPLOAD = MAX_PDF_UPLOAD_MB * 1024 * 1024;
