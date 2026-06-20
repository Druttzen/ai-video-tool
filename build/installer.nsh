; Custom NSIS hooks — Install Addons CMD launcher (Python pip + requirements.txt).

!macro customInstall
  CreateDirectory "$SMPROGRAMS\AI Video Creator"
  CreateShortcut "$SMPROGRAMS\AI Video Creator\Install Addons.lnk" "$INSTDIR\install-addons.cmd" "" "$INSTDIR\ai-video-tool.exe" 0
  CreateShortcut "$DESKTOP\AI Video Creator Install Addons.lnk" "$INSTDIR\install-addons.cmd" "" "$INSTDIR\ai-video-tool.exe" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\AI Video Creator\Install Addons.lnk"
  Delete "$DESKTOP\AI Video Creator Install Addons.lnk"
!macroend

!macro customFinish
  Exec '"$INSTDIR\install-addons.cmd"'
!macroend
