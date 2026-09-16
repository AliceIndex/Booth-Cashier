# Booth Cashier (屋台のためのレジ)

同人誌即売会（コミックマーケット、デザインフェスタ、文学フリマ等）や各種イベント出店のための、軽量・オフライン対応の **レジ会計＆売上分析システム** です。

メインPCを親機サーバーとして稼働させ、同じWi-Fiに接続した **iPadやスマートフォン等の外部端末のカメラからQRコードを読み取るだけ** で、すぐに複数端末によるレジ打ち運用が可能です。

---

## 主な特徴

- 📱 **QRコードで簡単接続**: メインPCの画面に表示されるQRコードをスマホやiPadで読み取るだけで、即座にレジ画面に接続（専用アプリのインストール不要・ブラウザのみで動作）。
- 🖥️ **バックグラウンド稼働 & 専用ポータル**: 黒いターミナル画面は出ず、既定ブラウザでメインPC専用のダッシュボード（ポータル画面）が自動起動。
- 📊 **リアルタイム売上分析**: 取引履歴の自動記録、日別・商品別の売上集計、Shift_JIS対応のCSVダウンロード機能。
- 📁 **CSVで商品管理**: 商品マスタ（`data/contents.csv`）はExcelで直接編集可能。ポータル画面のボタンからワンクリックでデータフォルダを開けます。
- 📦 **簡単インストール**: 日本語対応のWindowsインストーラー（Setup.exe）付属。デスクトップショートカットから起動可能。

---

## 推奨環境・動作環境

### 1. メインPC（サーバー機）
- **OS**: Windows 10 / Windows 11 (64-bit)
- **ブラウザ**: Google Chrome, Microsoft Edge, Mozilla Firefox などの最新バージョン
- **ネットワーク**: 外部端末と同一のローカルネットワーク（Wi-Fi ルーター、ポケットWi-Fi、スマートフォンのテザリング等）

### 2. レジ端末（iPad / スマートフォン / タブレット / サブPC）
- **OS**: iOS (iPadOS) 14以上, Android 8以上
- **ブラウザ**: Safari, Chrome などの標準ブラウザ
- **カメラ**: QRコード読み取りが可能な標準カメラ機能

> 💡 **オフライン運用について**:  
> インターネット接続がない会場でも、モバイルルーターやスマートフォンのテザリング（LAN通信のみ）環境があれば問題なく動作します。

### 3. 開発・ビルド環境（ソースコードからビルドする場合）
- **Node.js**: v20.0.0 または v22.0.0 以上（推奨: v22.x）
- **npm**: v10.0.0 以上

---

## 使い方

### 1. インストールと起動
1. [`Releases`](https://github.com/AliceIndex/Booth-Cashier/releases) から最新の `Booth-Cashier-Setup-v*.exe` をダウンロードします。
2. インストーラーを実行してPCにインストールします（管理者権限不要）。
3. デスクトップに作成された **「Booth Cashier」** ショートカットをダブルクリックします。
4. ターミナル画面（黒い画面）は表示されず、自動的に既定のブラウザで **「サーバーポータル画面」** が立ち上がります。

### 2. 外部端末（iPad・スマホ）からレジ画面を開く
1. メインPCとレジ端末（iPad・スマホ）を **同じWi-Fi（またはスマホのテザリング）** に接続します。
2. 端末のカメラで、メインPC画面に表示されている **接続用QRコード** を読み取ります。
3. レジ・商品選択画面（`index.html`）が開き、すぐに商品の選択と会計操作を行えます。

### 3. 商品データ（CSV）の登録・編集
1. ポータル画面の **「📁 データ・ログフォルダを開く」** ボタンをクリックします。
2. 開いたフォルダ内の `data/contents.csv` を Excel やメモ帳で編集します。
   - 列構成: `id,type,name,price`（商品ID, 種別[food/drink等], 商品名, 価格）
   - 文字コード: **Shift_JIS (CP932)**
3. 編集・保存後、次回起動時または画面リロード時に商品一覧へ反映されます。

### 4. 会計と売上集計
- **レジ操作**: 商品タイルをタップしてカートに入れ、「会計へ」進むと、受取額のテンキー入力とお釣りの自動計算が行えます。
- **売上分析**: ポータル画面の「📊 売上分析・管理者ページ」から、取引数・合計売上・商品別内訳の確認や、CSV/テキストログのダウンロードが可能です。

### 5. 終了手順
ポータル画面の右下にある **「🛑 サーバーを終了する」** ボタンをクリックします。確認ダイアログで「OK」を押すと、サーバープロセスが安全に停止します。

---

## 開発者向けガイド

### リポジトリのクローンと起動
```powershell
git clone https://github.com/AliceIndex/Booth-Cashier.git
cd Booth-Cashier
npm install
npm start
```

### ビルドコマンド
目的に応じて以下のビルドコマンドが利用できます：

```powershell
# 本番用インストーラー（Setup.exe / ターミナル完全非表示）を一括ビルド
npm run build:installer

# 開発者用ビルド（booth-cashier-dev.exe / ターミナル表示・ログリアルタイム確認用）
npm run build:dev

# 本番用ポータブルexeのみビルド
npm run build:exe
```

### GitHub Actions による自動リリース
リポジトリに `v*` のタグを push すると、GitHub Actions が自動でインストーラーとZIPアーカイブをビルドし、GitHub Release を作成・公開します：

```powershell
git tag v1.0.0
git push origin v1.0.0
```

---

## ディレクトリ構成

```text
Booth-Cashier/
├── .github/workflows/   # GitHub Actions (自動リリースワークフロー)
├── css/                 # スタイルシート (index.css, cashier.css, admin.css, portal.css)
├── data/                # 商品マスタ (contents.csv)
├── dist/                # ビルド出力ディレクトリ (installer, bin, dev)
├── installer/           # Inno Setup 設定スクリプト (setup.iss)
├── js/                  # クライアント側スクリプト (common.js, cart.js, contents.js, cashier.js, admin.js)
├── log/                 # 売上履歴ログ (purchase_log.csv, transactions/)
├── scripts/             # ビルド・保守用スクリプト (build-common.js, build-installer.js 等)
├── admin.html           # 売上分析・管理画面
├── cashier.html         # 会計・現計ページ
├── index.html           # 商品選択・レジトップ画面
├── package.json         # プロジェクト設定・依存関係
├── portal.html          # メインPC専用サーバーダッシュボード
├── README.md            # 本ドキュメント
└── server.js            # Express サーバー本体
```

---

## 著作権・ライセンス

- **Copyright (c) 2026 AliceIndex**
- **ライセンス**: 本ソフトウェアは [ISC License](LICENSE) のもとで公開されています。

