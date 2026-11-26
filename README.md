# 接客マスター

お客様係のための接客スキル研修アプリ。初級のヒアリングと商品・サービス提案を、各5問の4択で練習できます。アプリは HTML、CSS、JavaScript で動作し、学習履歴、経験値、コインは端末の IndexedDB に保存します。

## 開発テスト

依存パッケージは不要です。リポジトリのルートで次を実行します。

```sh
npm run dev
```

通常版は `http://localhost:4173/` です。承認済みの問題を `data/questions.json` に登録すると研修を開始できます。承認待ちの教材は Git に登録せず、手元の `dev/questions.json` に置き、`http://localhost:4173/?dev=1` で開きます。開発モードの履歴は通常版と別に保存します。

自動テストは Node.js 24 で `npm ci` の後に `npm test` で実行できます。採点に加え、架空データで回答、解説、総合評価、学習履歴の画面の処理を確認します。

問題データは配列です。各問題に `id`、`industry`、`audience`（初期対象は `customer-staff`）、`category`（`hearing` または `proposal`）、`difficulty`（`beginner`）、`scene`、`prompt`、`options`、`skills`、`status`（`pending` または `approved`）を指定します。選択肢は各4件で、`id`、`text`、`score`、`explanation` を持ちます。スキルIDは `app/training.mjs` を参照してください。

## V0.1 の仮ルール

- 正答率は完全正解数を5で割って算出。スキル評価は対象問題の獲得点を対象問題の満点で割って算出し、未出題は未評価と表示します。
- 研修1回で「50 + 得点」XP と「5 + 得点を20で割った整数部分」コインを付与します。レベルは200 XPごとに上がります。
- 評価が80点以上のスキルを強みとし、最も得点の低い評価済みスキルから練習例を表示します。評価済みスキルがすべて80点以上なら、利用可能なもう一方の研修を勧めます。

通常版には PWA の manifest と service worker を用意しています。ホーム画面への登録確認には HTTPS または localhost が必要です。オフラインではアプリ画面と端末の履歴を表示できます。研修開始には問題データの読み込みが必要です。
