const PREFIX = "[localCloudSync]";

/** Sync debugging — production me bhi console (user support). */
export function logLocalCloudSync(message: string, detail?: unknown): void {
  if (detail !== undefined) console.log(PREFIX, message, detail);
  else console.log(PREFIX, message);
}

export function warnLocalCloudSync(message: string, detail?: unknown): void {
  if (detail !== undefined) console.warn(PREFIX, message, detail);
  else console.warn(PREFIX, message);
}
