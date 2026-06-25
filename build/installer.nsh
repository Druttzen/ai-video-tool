; Custom NSIS hooks — Install Addons CMD launcher (Python pip + requirements.txt).
; Per-user vs all-users: shortcuts follow install location (Program Files vs AppData\Local\Programs).

!macro _SetInstallerShellContext
  StrCpy $0 $INSTDIR
  StrLen $1 $PROGRAMFILES64
  StrCpy $2 $0 $1
  StrCmp $2 $PROGRAMFILES64 0 +3
    SetShellVarContext all
    Goto shell_done
  StrLen $1 $PROGRAMFILES
  StrCpy $2 $0 $1
  StrCmp $2 $PROGRAMFILES 0 +3
    SetShellVarContext all
    Goto shell_done
  SetShellVarContext current
  shell_done:
!macroend

!macro customInstall
  !insertmacro _SetInstallerShellContext
  CreateDirectory "$SMPROGRAMS\AI Video Creator"
  CreateShortcut "$SMPROGRAMS\AI Video Creator\Install Addons.lnk" "$INSTDIR\install-addons.cmd" "" "$INSTDIR\ai-video-tool.exe" 0
  CreateShortcut "$DESKTOP\AI Video Creator Install Addons.lnk" "$INSTDIR\install-addons.cmd" "" "$INSTDIR\ai-video-tool.exe" 0
!macroend

!macro customUnInstall
  !insertmacro _SetInstallerShellContext
  Delete "$SMPROGRAMS\AI Video Creator\Install Addons.lnk"
  Delete "$DESKTOP\AI Video Creator Install Addons.lnk"
!macroend

!macro customFinish
  Exec '"$INSTDIR\install-addons.cmd"'
!macroend
