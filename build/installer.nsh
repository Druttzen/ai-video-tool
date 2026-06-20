; Custom NSIS hooks — bundle Setup Hub shortcut and launch it after install.

!macro customInstall
  CreateDirectory "$SMPROGRAMS\AI Video Creator"
  CreateShortcut "$SMPROGRAMS\AI Video Creator\Setup Hub.lnk" "$INSTDIR\setup-hub.exe" "" "$INSTDIR\setup-hub.exe" 0
  CreateShortcut "$DESKTOP\AI Video Creator Setup Hub.lnk" "$INSTDIR\setup-hub.exe" "" "$INSTDIR\setup-hub.exe" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\AI Video Creator\Setup Hub.lnk"
  Delete "$DESKTOP\AI Video Creator Setup Hub.lnk"
!macroend

!macro customFinish
  Exec '"$INSTDIR\setup-hub.exe"'
!macroend
