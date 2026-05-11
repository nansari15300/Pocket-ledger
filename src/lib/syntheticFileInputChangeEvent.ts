import type * as React from "react";

/** Hold-paste se `onChange` handler ko real `<input type=file>` jaisa event dena. */
export function syntheticFileInputChangeEvent(files: File[]): React.ChangeEvent<HTMLInputElement> {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return {
    target: { files: dt.files, value: "" },
  } as unknown as React.ChangeEvent<HTMLInputElement>;
}
