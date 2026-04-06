/**
 * compressFile() se pehle max raw image size — purana 5MB mobile par bade photos reject karta tha.
 * createImageBitmap resize se ab bada file bhi decode ho sakta hai (PC jaisa behaviour).
 */
export const MAX_IMAGE_MB_BEFORE_COMPRESS = 25;
export const MAX_IMAGE_BYTES_BEFORE_COMPRESS = MAX_IMAGE_MB_BEFORE_COMPRESS * 1024 * 1024;
