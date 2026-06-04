# FBX2VRMA Web App

[English](README.md)

FBX2VRMA Web App は、人型の FBX アニメーションファイルを `.vrma` に変換し、VRM モデル上でプレビューできる Web アプリです。

変換処理にはローカルパッケージ `fbx2vrma-converter/` を使用しています。Web アプリ本体はリポジトリ直下に配置されています。

## 機能

- 1つまたは複数の `.fbx` ファイルを `.vrma` に変換
- 変換後の各アニメーションを個別にプレビュー
- `.vrma` ファイルを個別にダウンロード、またはまとめて ZIP ダウンロード
- 英語/日本語のUI切り替え
- `public/vrm/Sample.vrm` のサンプルモデルでプレビュー
- ユーザー自身の `.vrm`、`.glb`、`.gltf` モデルをアップロードしてプレビュー
- アップロードされた FBX と生成された VRMA は変換中だけ一時保存し、レスポンス後に削除

## 構成

- フロントエンド: React、Vite、Three.js、`@pixiv/three-vrm`、`@pixiv/three-vrm-animation`
- バックエンド: Express API と一時ファイルアップロード
- 変換処理: ローカルの `fbx2vrma-converter/` パッケージ
- ネイティブ依存: `npm run setup` でダウンロードされる FBX2glTF

変換には Node.js のファイル処理とネイティブ実行ファイル FBX2glTF が必要です。そのため、このアプリは動的な Web Service としてデプロイしてください。GitHub Pages や Cloudflare Pages のような静的ホスティング単体では、変換 API を実行できません。

## 必要環境

- ローカル開発には Node.js 18 以上
- Render と同等の本番ビルド確認には Docker
- 変換対象の人型 FBX アニメーションファイル

## ローカル開発

依存関係をインストールし、環境に合った FBX2glTF バイナリをダウンロードします。

```bash
npm install
npm run setup
```

API サーバーを起動します。

```bash
npm run api
```

別ターミナルで Vite 開発サーバーを起動します。

```bash
npm run dev
```

`http://localhost:5173` を開いてください。Vite 開発サーバーは `/api` を `http://localhost:8787` にプロキシします。

## ローカルで本番起動

```bash
npm run build
npm start
```

`http://localhost:8787` を開いてください。

## Docker

本番用イメージをビルドして起動します。

```bash
docker build -t fbx2vrma-app .
docker run --rm -p 8787:10000 fbx2vrma-app
```

`http://localhost:8787` を開いてください。

## Render へのデプロイ

このリポジトリは、Docker を使った単体の Render Web Service としてデプロイできる構成です。

- `Dockerfile` がフロントエンドをビルドし、Linux 用 FBX2glTF をダウンロードし、Express サーバーを起動します。
- `server/index.cjs` は `0.0.0.0` で待ち受け、`PORT` 環境変数を使用します。
- `render.yaml` は Free プランの Docker Web Service と `/api/health` のヘルスチェックを定義しています。

デプロイ手順:

1. このリポジトリを GitHub に push します。
2. `fbx2vrma-converter/` がリポジトリ内容として含まれていることを確認します。未設定の入れ子 Git リポジトリのままにしないでください。
3. Render で GitHub リポジトリから Web Service または Blueprint を作成します。
4. 手動で Web Service を作成する場合は、Runtime に Docker を選択します。
5. Dockerfile path は `./Dockerfile`、Docker context は `.` のままにします。
6. デプロイし、最初のビルド完了を待ちます。
7. 生成された `https://your-service-name.onrender.com` を開きます。
8. 変換用バイナリのインストール確認が必要な場合は、`https://your-service-name.onrender.com/api/health` を確認します。

任意の環境変数:

| 変数 | デフォルト | 説明 |
| --- | --- | --- |
| `PORT` | Docker では `10000`、ローカルでは `8787` | HTTP サーバーのポート |
| `HOST` | `0.0.0.0` | HTTP サーバーのホスト |
| `MAX_FILES` | `10` | 1回のリクエストで受け付ける FBX ファイル数 |
| `MAX_FILE_SIZE_MB` | `100` | FBX 1ファイルあたりの最大アップロードサイズ |
| `CORS_ORIGIN` | `*` | 許可する CORS origin。フロントエンドと API を同じ Render Service で配信する場合は通常不要です。 |
| `FBX2GLTF_PATH` | 環境ごとのデフォルト | FBX2glTF 実行ファイルへのカスタムパス |

## カスタムドメイン

Render の `.onrender.com` URL で動作確認できた後、Render ダッシュボードでサブドメインを追加し、Cloudflare などの DNS 管理画面で Render から指定された DNS レコードを作成します。フロントエンドと API はどちらも同じ Render Service を origin として使う構成にします。

## 注意点

- Render の Free Web Service は一定時間アクセスがないとスピンダウンするため、再アクセス時の初回表示が遅くなることがあります。
- Render の Free Web Service は一時的なファイルシステムを使用します。このアプリは変換ファイルを一時保存してレスポンス後に削除するため、この制約と相性が良い構成です。
- 大きな FBX ファイルはアップロード、変換、プレビューに時間がかかります。`MAX_FILE_SIZE_MB` を増やす場合は、Render のプランに十分なメモリと CPU があるか確認してください。

## ライセンス

このプロジェクトは MIT License です。詳細は [LICENSE](LICENSE) を確認してください。
