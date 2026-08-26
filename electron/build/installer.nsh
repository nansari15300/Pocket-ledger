; Custom NSIS hooks for Pocket Ledger installer (wired via build.nsis.include).
; First install: optional desktop shortcut prompt. Update/reinstall: keep existing shortcut, no prompt.

Var PL_DESKTOP_PROMPT_OK

; Runs in .onInit before the old version is uninstalled — registry still shows a prior install.
!macro customInit
  StrCpy $PL_DESKTOP_PROMPT_OK "yes"
  ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $R1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${If} $R0 != ""
  ${OrIf} $R1 != ""
    StrCpy $PL_DESKTOP_PROMPT_OK "no"
  ${EndIf}
  ; Uninstaller-only NSIS compile skips customInstall — reference var here (warning 6001).
  ${If} $PL_DESKTOP_PROMPT_OK == ""
    StrCpy $PL_DESKTOP_PROMPT_OK "yes"
  ${EndIf}
!macroend

; Runs after unpack + shortcuts step: skipped when DO_NOT_CREATE_DESKTOP_SHORTCUT is set (see package.json),
; default addDesktopLink is a no-op, and we optionally create "$newDesktopLink" here if the user confirms.
!macro customInstall
  ; Silent (/S) installs stay non-interactive — no desktop prompt.
  ${IfNot} ${Silent}
    ; Update / reinstall (${isUpdated} is unreliable in customInstall — use customInit flag + existing .lnk).
    ${If} $PL_DESKTOP_PROMPT_OK == "no"
      Goto pl_desktop_done_pl
    ${EndIf}
    ${If} ${isUpdated}
      Goto pl_desktop_done_pl
    ${EndIf}
    ${If} ${FileExists} "$newDesktopLink"
      Goto pl_desktop_done_pl
    ${EndIf}
    ${If} ${FileExists} "$oldDesktopLink"
      Goto pl_desktop_done_pl
    ${EndIf}
    ; First install only — offer desktop shortcut once files are installed.
    MessageBox MB_YESNO|MB_ICONQUESTION "Create a shortcut on your desktop?" /SD IDNO IDYES pl_desktop_yes_pl IDNO pl_desktop_no_pl
    pl_desktop_yes_pl:
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    pl_desktop_no_pl:
    pl_desktop_done_pl:
  ${EndIf}
!macroend
