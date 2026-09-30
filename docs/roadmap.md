# 今後のロードマップ（デプロイ後〜）

現状: さくら VPS 上に Docker Compose で稼働中。IP 直打ち + HTTP のみで公開済み
（`docs/server-setup.md` 参照）。ここから先、次の 4 つを実施する。

1. ドメイン契約 + 検索可能化（HTTPS 化含む）
2. セキュリティ強化
3. GitHub Actions で CI/CD
4. UI 強化（内容は別途検討済み・本ドキュメントでは扱わない）

### CI と CD の違い（本ロードマップでの扱い）

- **CI（継続的インテグレーション）= Phase 0**: PR を出すたびに `go test` / `go vet` /
  `npm run lint,build` を自動実行する「品質ゲート」。デプロイはしない。
- **CD（継続的デプロイ）= Phase 4**: `main` マージ後、VPS に自動反映するところまでやる。
  無くしたわけではなく、デプロイ先の構成（ドメイン/TLS）が固まってから着手した方が
  手戻りが少ないため、あえて後ろに置いている。

## 進める順番と理由

```
Phase 0: CI（PRゲート）        ← 最優先。以降の全変更の土台
   │
Phase 1: ドメイン + DNS        ← 事務作業。並行して他を進めてよい
   │
Phase 2: HTTPS化 + CORS更新    ← DNSが向いていないと証明書が取れないため Phase1 に依存
   │
Phase 3: セキュリティ強化      ← HTTPS化の変更点（nginx設定等）を土台にまとめて行う
   │
Phase 4: CD（自動デプロイ）    ← デプロイ先の構成（ドメイン/TLS）が固まってから作る方が手戻りがない

UI強化: Phase0の直後から他フェーズと並行して継続（インフラ変更への依存なし）
```

- **CI を最優先にする理由**: 4人（3人+並行でUI強化）が同時にコードを触るフェーズに入るため、
  先に「PR で `go test` / `go vet` / `npm run lint,build` が自動で回る」状態を作らないと、
  他の変更のレビューコストが跳ね上がる。
- **ドメイン→HTTPS の順**: Let's Encrypt の証明書発行には、ドメインが VPS の IP を指している
  必要がある。DNS 反映待ち（数十分〜数時間）が発生するので、契約と DNS 設定は早めに着手する。
- **HTTPS→セキュリティ強化の順**: HTTPS化で `front-end/nginx.conf` と `main.go` の CORS
  設定を触るため、その延長でセキュリティヘッダーやレート制限もまとめて入れる方が変更が少ない。
- **CD を最後にする理由**: デプロイ先の URL・ポート構成（80→443化）が変わる前に自動デプロイを
  組むと、Phase2 の変更で CD スクリプトを書き直すことになる。CI（Phase0）は先に作ってよいが、
  実サーバーへの自動デプロイ（CD）は構成が安定してからにする。

## 分担の考え方

3人が同時に別タスクへ入れるよう、フェーズではなく**役割寄りの小タスク単位**で割り振る
（`work-plan-granularity` メモ方針）。カッコ内は担当のおすすめ、状況に応じて入れ替えてよい。

- **インフラ寄り**: ドメイン・DNS・HTTPS・サーバー側セキュリティ・CD
- **バックエンド寄り**: CORS更新・GIN_MODE・レート制限・go vet/govulncheckのCI組み込み
- **フロントエンド寄り**: UI強化・npm lint/buildのCI組み込み

CI（Phase0）だけは 1 人がまとめて作った方が速い（ワークフローファイルは1つなので分割しづらい）。

---

## Phase 0: CI（GitHub Actions）

### ブランチ運用との関係

各自 `feature/xxx` を `main` から切って作業し、`main` 宛の PR を出す今までの運用はそのまま。
CI は `on: pull_request: branches: [main]` で PR ごとに自動実行される（PR 作成時・以後の push
のたびに再実行）。PR は並列に走っても back-end のテスト用 DB は各ジョブで毎回まっさらに
立てるので、他の人の PR と衝突しない。`pull_request` イベントは「`main` にマージした想定の
コード」に対して走るため、他の PR が先にマージされたことによる意味的な衝突もある程度拾える。

- [x] `.github/workflows/ci.yml` を作成。PR / main への push をトリガーに:
  - [x] back-end: `go vet ./...`、`go test -v`（PostgreSQL は `services:` で
        `postgres:17-alpine` コンテナを起動し、`DB/01_create_table.sql` →
        `DB/02_add_vegetable.sql` を流してから実行）
  - [x] front-end: `npm ci`、`npm run lint`、`npm run build`
        （フロントにユニットテスト／テストランナーは無いので、品質ゲートは lint + build）
- [x] GitHub リポジトリ設定（Settings → Branches）で `main` にブランチ保護ルールを追加:
      （ワークフローが一度成功してから、チェック名 `back-end` / `front-end` を指定する）
  - [x] Require a pull request before merging（直接 push 禁止）
  - [x] Require status checks to pass before merging（上記 CI のジョブ名を指定）
  - [x] Require branches to be up to date before merging
  - [x] Require approvals: 1（3人チームなので自分以外1人のレビュー必須）
- [x] `back-end/.env` 相当の値（`JWT_SECRET` 等）は CI 用にダミー値を Secrets ではなく
      ワークフロー内に直書きでよい（本番の値とは無関係なため）

**DoD**: 適当な PR を出して、CI が自動で回り、わざと壊した場合に赤くなることを確認。

---

## Phase 1: ドメイン契約 + DNS

- [x] ドメイン名を決めて契約（レジストラはどこでも可。更新費用も確認しておく）
- [x] レジストラ or Cloudflare 等の DNS で A レコードを VPS の IP に向ける
- [x] TTL を短め（300秒程度）にしておく（Phase2 で切り替えがしやすいように）
- [x] `dig <ドメイン>` / `nslookup <ドメイン>` で反映を確認

**DoD**: `http://<ドメイン>/` で既存の VPS（IP直打ちと同じ内容）が表示される。

---

## Phase 2: HTTPS化 + CORS更新

- [x] VPS に certbot を導入（webroot 方式。`front-end/nginx.conf` の `location /` 配下に
      `/.well-known/acme-challenge/` の静的配信を追加してから取得する）
      → 手順は `docs/server-setup.md` の「3.1」。2026-09-29 に取得済み
      （`www.vegetask.net` + `vegetask.net` の 1 枚、有効期限 2026-12-28）
- [x] `front-end/nginx.conf` に 443 の server ブロックを追加、80 は 443 へリダイレクト
- [x] 証明書ファイルをコンテナにマウント（`docker-compose.yml` の `front` サービスに
      volume 追加）
- [x] 証明書の自動更新（`certbot renew` を cron/systemd timer で。更新後に
      `docker compose exec front nginx -s reload` が必要な点に注意）
      → 手順（deploy フック）は `docs/server-setup.md` の「3.1」。2026-09-29 に設定済み
      （`certbot.timer` 有効、`reload-front.sh` 設置、`renew --dry-run` 成功）
- [x] `back-end/main.go` の `AllowOrigins`（CORS）をドメインの `https://` に更新
      （ルーティングの単一情報源方針どおり、変更はここだけ）
- [x] `docker-compose.yml` で 443 番もホストに公開
- [x] `docs/server-setup.md` の「公開してよいポート」節を 80/443 に更新
- [x] ファイアウォールで 443 を許可（当初は `sudo ufw status` で確認する想定だった）
      → VPS に ufw は無く、nftables も Docker 管理のルールのみでホスト側の対応は不要。
      さくらのパケットフィルタで 443 が許可されているかを VPS 以外の端末から要確認
      （`docs/server-setup.md` の「5.」）
- [x] `front-end/public/robots.txt` と `front-end/public/sitemap.xml` の URL を
      `https://www.vegetask.net/` に更新し、`vegetask.net`（www なし）は www 付きへリダイレクト
      （リダイレクトは nginx 側。www なしの A レコード追加が別途必要）

**DoD**: `https://<ドメイン>/` で SPA が表示され、`http://` アクセスが 443 へリダイレクトされる。
ブラウザで証明書エラーが出ない。

---

## Phase 3: セキュリティ強化

- [x] **本番モード化**: `GIN_MODE=release` を `./.env` に追加（現状デバッグモードで
      詳細ログが出ている）→ 手順は `docs/server-setup.md` の「5.1」。VPS での作業が残り
- [x] **セキュリティヘッダー**: `front-end/nginx.conf` に `Strict-Transport-Security` /
      `X-Content-Type-Options: nosniff` / `X-Frame-Options: DENY` を追加
- [x] **ログイン/サインアップのレート制限**: nginx の `limit_req` で
      `/api/login` `/api/signup` にブルートフォース対策を入れる
- [ ] **SSH強化**: パスワード認証を無効化し鍵認証のみに、root ログイン禁止、
      必要なら `fail2ban` 導入 → 手順は `docs/server-setup.md` の「5.1」。VPS での作業が残り
- [ ] **DBバックアップ**: `pg_dump` を定期実行し VPS 外（ローカル or オブジェクトストレージ）
      に保存する仕組みを作る。現状 `docs/db-operations.md` は「データ破棄前提」の運用なので、
      実ユーザーが増えた後の喪失リスクとして別途方針を決める
      → 手順は `docs/server-setup.md` の「5.1」。VPS での作業が残り
- [x] **依存関係の脆弱性チェック**: CI に `govulncheck` と `npm audit`（or Dependabot 有効化）
      を追加
- [x] **リフレッシュトークンの扱いを決める**: 現状発行はされるが再発行エンドポイントが無い
      （`CLAUDE.md` 記載の既知の状態）。実装して使うか、使わないなら発行自体をやめるか方針を決める
- [x] `.env` の権限（`660` / `vegetask-dev` グループのみ）が保たれているか再確認

**DoD**: 上記チェックリストを一通り実施し、`docs/server-setup.md` に反映。

---

## Phase 4: CD（GitHub Actions で自動デプロイ）

方式: `appleboy/ssh-action` で VPS に SSH し、VPS 上で `git pull` → `docker compose up -d --build`
（`.github/workflows/cd.yml`）。レジストリ経由などの仕組みは規模に見合わないので入れない。

- [x] デプロイ方式を決める → 上記
- [x] サーバーの作業ツリーを片付ける（直接編集が残っていると `git pull --ff-only` が失敗するため）
      → 2026-09-30 に `origin/main` へ上書き済み
- [x] CD 用ユーザー `deploy` を作成（`docker` / `vegetask-dev` のみ、sudo なし）し、
      CD 専用の鍵を登録 → 手順は `docs/server-setup.md` の「4.1」。2026-09-30 に接続確認済み
- [x] GitHub Actions の Secrets に `SSH_HOST` / `SSH_USER` / `SSH_KEY` / `SSH_FINGERPRINT` を登録
- [x] CI が `main` で成功した後にのみデプロイが走るようにする（`workflow_run`。`ci.yml` は
      `cancel-in-progress` なので同じファイルには入れない）
- [x] 誤ったデプロイの防止は、Phase 0 のブランチ保護（レビュー必須）で代える。承認ステップは入れない
- [x] デプロイ失敗時の通知 → GitHub 標準の失敗通知メールで足りるとし、Webhook は入れない
- [x] `docs/server-setup.md` の「4. 通常の更新フロー」を「CD が自動で行う」旨に更新し、
      手動手順は障害時の代替手順として残す

**DoD**: `main` にマージすると数分後に `https://<ドメイン>/` に反映される。ロールバック手順
（`docs/server-setup.md` の 6.）が CD 後も機能することを確認。

---

## その他、検討しておくべきこと

- **VPS のスペック**: 現行 1 vCPU / メモリ 455MiB は back-end のビルドだけで手一杯
  （初回ビルド約8分）。実アクセスが増えた場合の余力は無いので、公開後にスペックアップの
  要否を見る
- **死活監視**: UptimeRobot 等の無料枠でダウン検知だけでも入れておくと、障害に気づくのが早い
- **ディスク逼迫**: `docs/server-setup.md` にある `docker system prune` / `docker builder prune`
  を定期実行するか、CD 導入時に自動化するか決める
- **利用規約・プライバシーポリシー**: ドメインで一般公開し実ユーザーデータを扱うことになるため、
  必要に応じて検討（本ロードマップのスコープ外・後回しでよい）
