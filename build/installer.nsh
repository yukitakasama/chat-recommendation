!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER
  Var ChatInsightUpdateBackupDir
  Var ChatInsightRegisteredInstallDir
!endif

!macro customInit
  # A previous installation can be replaced by a newer NSIS package. Its
  # uninstaller removes the whole install directory, so move the encrypted
  # vault outside that directory before the old uninstaller starts.
  ReadRegStr $ChatInsightRegisteredInstallDir SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $ChatInsightRegisteredInstallDir != ""
  ${AndIf} $ChatInsightRegisteredInstallDir != $INSTDIR
  ${AndIf} ${FileExists} "$ChatInsightRegisteredInstallDir\data\vault.manifest.json"
    SetErrorLevel 1
    MessageBox MB_OK|MB_ICONSTOP "The existing ChatInsight data cannot be moved to a different installation directory during an update. Please rerun the installer with the existing directory."
    Quit
  ${EndIf}

  StrCpy $ChatInsightUpdateBackupDir "$INSTDIR\..\ChatInsight-data-update-backup"

  ${If} ${FileExists} "$INSTDIR\data\vault.manifest.json"
    ${If} ${FileExists} "$ChatInsightUpdateBackupDir\*.*"
      SetErrorLevel 1
      MessageBox MB_OK|MB_ICONSTOP "Both the ChatInsight data directory and an interrupted-update backup exist. No files were deleted. Resolve the two paths manually before updating:$\r$\n$INSTDIR\data$\r$\n$ChatInsightUpdateBackupDir"
      Quit
    ${EndIf}

    ClearErrors
    Rename "$INSTDIR\data" "$ChatInsightUpdateBackupDir"
    ${If} ${Errors}
      SetErrorLevel 1
      MessageBox MB_OK|MB_ICONSTOP "ChatInsight could not protect the existing data before updating. The installer stopped without deleting the data directory:$\r$\n$INSTDIR\data"
      Quit
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  # Restore the encrypted vault only after all new application files have been
  # extracted. Rename is atomic on the same volume and never merges databases.
  ${If} ${FileExists} "$ChatInsightUpdateBackupDir\*.*"
    ${If} ${FileExists} "$INSTDIR\data\*.*"
      SetErrorLevel 1
      MessageBox MB_OK|MB_ICONSTOP "A data directory unexpectedly exists while restoring a protected backup. Neither directory was deleted:$\r$\n$INSTDIR\data$\r$\n$ChatInsightUpdateBackupDir"
      Quit
    ${EndIf}

    ClearErrors
    Rename "$ChatInsightUpdateBackupDir" "$INSTDIR\data"
    ${If} ${Errors}
      SetErrorLevel 1
      MessageBox MB_OK|MB_ICONSTOP "The new version was installed, but ChatInsight could not restore the encrypted vault. The complete backup remains at:$\r$\n$ChatInsightUpdateBackupDir$\r$\n$\r$\nRestart the installer after resolving the file lock or permission issue."
      Quit
    ${EndIf}
  ${EndIf}
!macroend
