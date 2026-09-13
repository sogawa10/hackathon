# サーバー側デプロイ手順書（さくら VPS）

さくら VPS（Debian、複数ユーザーで共同運用）上に VegeTASK をデプロイ・更新するための手順です。
この手順書だけを見て、初めて触るメンバーでもデプロイを再現できることを目指します。

前提となる決定事項は `docs/deployment-plan.md` を参照してください（特に D6〜D9）。

---

## 0. 前提

- Docker / Docker Compose（v2、`docker compose` サブコマンド）が導入済みであること。
- リポジトリが `/opt/vegetask` に `git clone` 済みであること。
- 以降の手順はこのディレクトリで実行します。

```bash
cd /opt/vegetask
```

---

## 1. 共有ユーザー・グループの準備

チームメンバー全員が同じ手順でデプロイ・更新できるよう、2 つのグループに所属させます。

| グループ | 用途 |
|---|---|
| `docker` | `docker compose` を sudo なしで実行するため |
| `vegetask-dev` | `/opt/vegetask` と `./.env` を共有するため |

```bash
# 各メンバーを両グループに追加（root で実行）
sudo usermod -aG docker <ユーザー名>
sudo usermod -aG vegetask-dev <ユーザー名>
```

グループ変更はログインし直すまで反映されないので、追加後は一度ログアウト・ログインし直してください。

> 現行の VPS ではここから先の「共有ディレクトリ化」は設定済みです。以下はサーバーを再構築する
> 場合に同じ状態を再現するための手順として記載します。

### 1.1 `/opt/vegetask` の共有ディレクトリ化

```bash
# 所有グループを vegetask-dev に、以降作成されるファイルも同グループになるよう setgid を付与
sudo chgrp -R vegetask-dev /opt/vegetask
sudo find /opt/vegetask -type d -exec chmod g+s {} +

# ACL で「グループの書き込み権限」を既存ファイル・新規ファイル双方に強制する
sudo apt-get install -y acl
sudo setfacl -R -m g:vegetask-dev:rwX /opt/vegetask
sudo setfacl -R -d -m g:vegetask-dev:rwX /opt/vegetask
```

setgid だけだと `git pull` で増えるファイルの「パーミッション」（rw か r か）は各自の umask 次第に
なるため、ACL のデフォルトエントリ（`-d`）でグループ書き込みを強制しています。

---

## 2. `./.env` の作成

サーバー側の秘密情報・設定は、リポジトリ直下の `./.env` **1 ファイル**に集約します
（`back-end/.env` はサーバーには作りません。ローカルで Docker を使わず `go run` / `go test` する
人専用です）。

1. README.md の「環境変数」表（サーバーの `./.env` の節）を見ながら、必要なキーをすべて埋めた
   `.env` をリポジトリ直下に作成します。

   ```bash
   DB_HOST=db
   DB_PORT=5432
   DB_USER=vegetask_user
   DB_PASS=<本番用に新規発行した値>
   DB_NAME=vegetask_db
   JWT_SECRET=<本番用に新規発行した値>
   # MOCK_TODAY は書かない（本番は実日付を使う）
   ```

2. `DB_PASS` と `JWT_SECRET` は、ハッカソン時に使っていた値を**流用せず**、本番用に新しい値を
   発行します（D9）。記号を含めたくない場合は次のように生成できます。

   ```bash
   openssl rand -hex 32
   ```

3. 権限を絞ります。

   ```bash
   chgrp vegetask-dev .env
   setfacl -b .env        # 継承したデフォルト ACL を除去（others に見えないようにする）
   chmod 660 .env          # オーナー・グループのみ読み書き可、others は不可
   ```

---

## 3. 初回起動

```bash
docker compose up -d --build
```

- 初回はイメージのビルドに数分かかります。
- DB の初期化 SQL（`DB/01_create_table.sql` → `DB/02_add_vegetable.sql`）は、
  **`db` サービスのデータボリューム（`pgdata`）が空のときだけ**自動実行されます。2 回目以降の
  起動では実行されないため、スキーマを変更したい場合は `docs/db-operations.md` の手順に従って
  ください。

起動後、以下で状態を確認します。

```bash
docker compose ps          # 3 サービスとも running / healthy
docker compose logs -f     # 起動ログを確認（Ctrl+C で抜ける）
```

ブラウザ（または `curl`）で `http://<VPS-IP>/` にアクセスして SPA が表示されること、
`curl http://<VPS-IP>/api/tasks` が 401（未認証エラー = 経路自体は正常）を返すことを確認します。

---

## 4. 通常の更新フロー

コードを変更してマージした後、サーバー側で反映する手順です。

```bash
cd /opt/vegetask
git pull
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
```

- `./.env` は `git pull` の対象外（`.gitignore` 済み）なので、キーが増えた場合は手動で追記して
  ください。
- DB のスキーマ自体を変更した PR がマージされた場合は、`git pull` だけでは反映されません
  （initdb.d は初回のみ実行のため）。`docs/db-operations.md` を参照してください。

---

## 5. ネットワーク・公開ポートの確認

- 公開してよいのは **80 番（Nginx）のみ**です。`back-end`（3000）・`db`（5432）は
  `docker-compose.yml` 上でホストに `ports` を公開していないため、外部から直接は到達できません。
  `docker compose ps` の `PORTS` 列で 3000 / 5432 がホストに出ていないことを確認してください。
- アクセスは IP 直打ち・`http` のみです（ドメイン・TLS 終端は本計画のスコープ外）。
- ホストのファイアウォール（`ufw` 等を使っている場合）で 80 番のみが開放されていることを
  確認します。

  ```bash
  sudo ufw status
  ```

---

## 6. ロールバック

直前のリリースに戻したい場合は、対象のコミット（またはタグ）へ戻して再ビルドします。

```bash
git log --oneline -5        # 戻したいコミットを確認
git checkout <直前のコミットハッシュ>
docker compose up -d --build
```

作業ブランチに戻す場合は、戻す前に `git status` で未コミットの変更が無いことを確認してください。

---

## 7. 日常運用

- ログ確認: `docker compose logs -f <サービス名>`（`db` / `back-end` / `front`）。
- 不要になった古いイメージ・ビルドキャッシュの掃除は定期的に行います。

  ```bash
  docker system prune -f
  ```

- ディスク使用量は `df -h` と `docker system df` で定期的に確認してください（特に `pgdata`
  ボリュームの肥大化）。

---

## 8. トラブルシューティング

| 症状 | 確認・対処 |
|---|---|
| `back-end` が起動直後に落ちる（再起動を繰り返す） | `docker compose logs back-end` で DB 接続エラーかを確認。`db` の healthcheck が通るまで `back-end` は起動しない設計だが、`./.env` の `DB_HOST` / `DB_USER` / `DB_PASS` / `DB_NAME` が `docker-compose.yml` 上の `db` の設定と一致しているか確認する。 |
| 日本語のファイル名（`/野菜L/...` など）の静的アセットが 404 になる | `front-end/nginx.conf` の `charset utf-8;` 設定と、`npm run build` の成果物（`dist/`）が正しくイメージに含まれているか確認する。 |
| `/api/subtasks/today` など日付に依存する API が 500 になる | back-end イメージに `tzdata` が入っているか（`back-end/Dockerfile` の `apk add --no-cache tzdata ca-certificates`）を確認する。 |
| `docker compose up` 時に `.env` のキー不足でエラーになる | README.md の「環境変数」表と `./.env` を突き合わせ、不足しているキーを追記する。 |
| ページの再読み込みや `/tasks` への直アクセスで 404 になる | `front-end/nginx.conf` の `location /` に `try_files $uri $uri/ /index.html;`（SPA フォールバック）が設定されているか確認する。 |

---

## 9. 完了条件（DoD）チェックリスト

- [ ] この手順書だけを見て、関与していないメンバーがクリーンな VPS 相当の環境からデプロイを
      再現できる（レビューで読み合わせ済み）。
- [ ] `docker compose ps` で `back-end` / `db` がホストにポート公開されていないことを確認した。
- [ ] `./.env` の権限が `660` かつ `vegetask-dev` グループのみ書き込み可であることを確認した。