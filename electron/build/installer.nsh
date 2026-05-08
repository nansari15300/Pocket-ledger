; Custom NSIS hooks for Pocket Ledger installer (wired via build.nsis.include).
; Lets the user opt in to a desktop shortcut instead of electron-builder creating it unconditionally.

; Runs after unpack + shortcuts step: skipped when DO_NOT_CREATE_DESKTOP_SHORTCUT is set (see package.json),
; default addDesktopLink is a no-op, and we optionally create "$newDesktopLink" here if the user confirms.
!macro customInstall
  ; Silent (/S) and upgrade installs keep non-interactive / prior behaviour — no desktop prompt.
  ${IfNot} ${Silent}
    ${IfNot} ${isUpdated}
      ; Offer desktop shortcut once files are installed; $appExe / $newDesktopLink already set by setLinkVars earlier in installSection.
      MessageBox MB_YESNO|MB_ICONQUESTION "Create a shortcut on your desktop?" /SD IDNO IDYES pl_desktop_yes_pl IDNO pl_desktop_no_pl
      pl_desktop_yes_pl:
        CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
        ; Notify Explorer so the desktop icon shows without a refresh (matches stock addDesktopLink).
        System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
      pl_desktop_no_pl:
    ${EndIf}
  ${EndIf}
!macroend
