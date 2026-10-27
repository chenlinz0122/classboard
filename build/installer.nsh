!macro customUnInstall
  ; 卸载时移除开机自启项，避免残留一个指向已删除程序的启动条目。
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ClassBoard"
!macroend