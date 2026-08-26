; Custom NSIS hooks for Pocket Ledger installer (wired via build.nsis.include).
; First install: optional desktop shortcut prompt. Update/reinstall: keep existing shortcut, no prompt.
; BUILD_UNINSTALLER pass: no Var / desktop logic (NSIS warning 6001 as error otherwise).

!ifdef BUILD_UNINSTALLER
!macro customInit
!macroend
!macro customInstall
!macroend
!else

Var PL_DESKTOP_PROMPT_OK

!macro customInit
  StrCpy $PL_DESKTOP_PROMPT_OK "yes"
  ReadRegStr $R0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ReadRegStr $R1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
  ${If} $R0 != ""
  ${OrIf} $R1 != ""
    StrCpy $PL_DESKTOP_PROMPT_OK "no"
  ${EndIf}
!macroend

!macro customInstall
  ${IfNot} ${Silent}
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

!endif
