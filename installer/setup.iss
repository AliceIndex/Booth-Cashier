; Script generated for Booth Cashier Inno Setup
#define MyAppName "Booth Cashier"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "AliceIndex"
#define MyAppURL "https://github.com/AliceIndex/Booth-Cashier"
#define MyAppExeName "booth-cashier.exe"

[Setup]
; NOTE: The value of AppId uniquely identifies this application.
AppId={{D1A3C4B8-92E5-4C1F-95C8-1F8E325D7E99}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\Programs\Booth-Cashier
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=Booth-Cashier-Setup-v{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; 管理者権限不要（一般権限で動作し、ファイルの読み書き権限トラブルを防止）
PrivilegesRequired=lowest
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "japanese"; MessagesFile: "compiler:Languages\Japanese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Dirs]
Name: "{app}\data"
Name: "{app}\log"
Name: "{app}\log\transactions"

[Files]
; 実行ファイル本体
Source: "..\dist\bin\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
; 静的アセット（HTML, CSS, JS）
Source: "..\dist\bin\*.html"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\dist\bin\css\*"; DestDir: "{app}\css"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\dist\bin\js\*"; DestDir: "{app}\js"; Flags: ignoreversion recursesubdirs createallsubdirs
; 初期商品CSV（すでに存在する場合は上書きせず、ユーザーの編集内容を保護）
Source: "..\dist\bin\data\contents.csv"; DestDir: "{app}\data"; Flags: onlyifdoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\データ・ログフォルダを開く"; Filename: "{win}\explorer.exe"; Parameters: """{app}"""
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

