# サーバー側デプロイ手順書（さくら VPS）

さくら VPS（Debian、複数ユーザーで共同運用）上に VegeTASK をデプロイ・更新するための手順です。
この手順書だけを見て、初めて触るメンバーでもデプロイを再現できることを目指します。

アーキテクチャの概要は `README.md` の「デプロイ構成」を参照してください。

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
   GIN_MODE=release
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

> `front` は起動時に `/etc/letsencrypt/live/www.vegetask.net/` の証明書を読み込むため、
> **先に「3.1 HTTPS 証明書の取得」を済ませてから**起動してください（証明書が無いと
> `front` が起動直後に落ちます）。

```bash
docker compose up -d --build
```

- イメージのビルドには時間がかかります。現行の VPS（1 vCPU / メモリ 455MiB）では初回が
  約 8 分（実測 470 秒。ほぼすべて back-end の `go build`）でした。途中で止まったように見えても
  中断せず待ってください。
- DB の初期化 SQL（`DB/01_create_table.sql` → `DB/02_add_vegetable.sql`）は、
  **`db` サービスのデータボリューム（`pgdata`）が空のときだけ**自動実行されます。2 回目以降の
  起動では実行されないため、スキーマを変更したい場合は `docs/db-operations.md` の手順に従って
  ください。

起動後、以下で状態を確認します。

```bash
docker compose ps          # 3 サービスとも running / healthy
docker compose logs -f     # 起動ログを確認（Ctrl+C で抜ける）
```

ブラウザ（または `curl`）で `https://www.vegetask.net/` にアクセスして SPA が表示されること、
`curl https://www.vegetask.net/api/tasks` が 401（未認証エラー = 経路自体は正常）を返すことを
確認します。あわせて、`http://` や www なしのアクセスが `https://www.vegetask.net/` へ
301 リダイレクトされることも確認します。

```bash
curl -sI http://www.vegetask.net/  | grep -i -E '^(HTTP|location)'   # 301 → https://www.vegetask.net/
curl -sI https://vegetask.net/     | grep -i -E '^(HTTP|location)'   # 301 → https://www.vegetask.net/
```

DB の初期化（スキーマとシード）が済んでいることは、野菜マスタの件数で確認できます
（15 件が正）。

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from \"VEGETABLES\";"'
```

> 本番の `./.env` には `GIN_MODE=release` を書く（5.1 参照）。未設定だと `[GIN-debug]` が
> 出て詳細ログが残ります。また、back-end のログ上の接続元 IP は Docker ブリッジのアドレス
> （`172.18.0.1` など）になります。実際のクライアント IP を調べたい場合は Nginx 側のログを
> 見てください。

### 3.1 HTTPS 証明書の取得（初回のみ）

証明書は Let's Encrypt から **ホスト側の certbot**（webroot 方式）で取得し、`front` コンテナには
`/etc/letsencrypt`（証明書）と `/var/www/certbot`（ACME チャレンジ用ファイル）を読み取り専用で
マウントしています（`docker-compose.yml` 参照）。証明書は `www.vegetask.net` と
`vegetask.net`（www なし、www 付きへリダイレクトするために必要）の 2 つを 1 枚でカバーします。

前提:

- `www.vegetask.net` と `vegetask.net` の **両方**の A レコードが VPS の IP を向いていること
  （`nslookup vegetask.net` で確認。片方でも引けないと発行に失敗します）。
- ファイアウォールで 80 / 443 番を許可していること（5. 参照）。

1. certbot を導入し、webroot 用ディレクトリを作ります。

   ```bash
   sudo apt-get update
   sudo apt-get install -y certbot
   sudo mkdir -p /var/www/certbot
   ```

2. 初回は証明書が無いため HTTPS 版の `front` を起動できません。一時的に `front` を止め、
   webroot を配信するだけの Nginx を 80 番で立てて証明書を取得します（その間 1〜2 分サイトが
   止まります）。

   ```bash
   cd /opt/vegetask
   docker compose stop front
   docker run -d --rm --name acme-tmp -p 80:80 \
     -v /var/www/certbot:/usr/share/nginx/html:ro nginx:1.27-alpine

   sudo certbot certonly --webroot -w /var/www/certbot \
     -d www.vegetask.net -d vegetask.net \
     --cert-name www.vegetask.net \
     --email <連絡用メールアドレス> --agree-tos --no-eff-email

   docker stop acme-tmp
   ```

   `/etc/letsencrypt/live/www.vegetask.net/fullchain.pem` と `privkey.pem` ができていれば成功です。

3. HTTPS 版の `front` を起動します（まだ `git pull` していなければここで行う）。

   ```bash
   git pull
   docker compose up -d --build front
   ```

4. 自動更新を設定します。Debian の certbot パッケージは `certbot.timer`（systemd timer）で
   1 日 2 回 `certbot renew` を自動実行します。ただし Nginx は証明書を起動時にしか読み込まない
   ため、**更新後に `front` をリロードするフック**を置きます。

   ```bash
   sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-front.sh > /dev/null <<'EOF'
   #!/bin/sh
   cd /opt/vegetask && docker compose exec -T front nginx -s reload
   EOF
   sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-front.sh

   systemctl list-timers certbot.timer   # タイマーが有効か確認
   sudo certbot renew --dry-run          # 更新がエラーなく通るか確認（フックは dry-run では実行されない）
   ```

   更新時の認証は `front` 自身が `/.well-known/acme-challenge/` を `/var/www/certbot` から
   配信するので、サイトを止める必要はありません。

---

## 4. 通常の更新フロー

`main` へのマージは **CD（`.github/workflows/cd.yml`）が自動で反映します**。CI が成功した
コミットまで `git pull` し、`docker compose up -d --build` した後、公開 URL の疎通を確認します
（back-end の変更を含むと 10 分前後）。進捗と結果は GitHub の Actions タブで確認できます。

> **サーバー上でリポジトリのファイルを直接編集しないでください。** 未コミットの変更が残って
> いると、CD の `git pull` が失敗します。

CD が失敗したときや止めたいときは、サーバーで手動で反映します。

```bash
cd /opt/vegetask
git pull
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
```

- back-end のソースを変更した場合は `go build` がやり直しになり、現行の VPS では 8 分前後かかります
  （front-end のみの変更なら 20 秒程度）。
- `./.env` は `git pull` の対象外（`.gitignore` 済み）なので、キーが増えた場合は手動で追記して
  ください。
- DB のスキーマ自体を変更した PR がマージされた場合は、`git pull` だけでは反映されません
  （initdb.d は初回のみ実行のため）。`docs/db-operations.md` を参照してください。CD もこれは
  行いません。

### 4.1 CD 用ユーザー（`deploy`）と鍵

CD は専用ユーザー `deploy`（`docker` / `vegetask-dev` のみ、sudo なし）で SSH します。
サーバーを再構築する場合の作り方は次のとおりです。

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker,vegetask-dev deploy
# /opt/vegetask は deploy の所有ではないため、git の所有者チェックを許可する
sudo -u deploy git config --global --add safe.directory /opt/vegetask
sudo -u deploy mkdir -p -m 700 /home/deploy/.ssh
```

CD 専用の鍵ペア（パスフレーズなし）を手元で作り、公開鍵を登録します。

```bash
# 手元の PC で
ssh-keygen -t ed25519 -C "vegetask-cd" -f ~/.ssh/vegetask_cd -N ""

# VPS で（公開鍵の 1 行を貼る）
echo '<vegetask_cd.pub の中身>' | sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys
sudo -u deploy chmod 600 /home/deploy/.ssh/authorized_keys
```

GitHub の Settings → Secrets and variables → Actions に次を登録します。

| Secret | 値 |
|---|---|
| `SSH_HOST` | `www.vegetask.net` |
| `SSH_USER` | `deploy` |
| `SSH_KEY` | 秘密鍵 `vegetask_cd` の中身（`-----BEGIN` から `END-----` の行まで全部） |
| `SSH_FINGERPRINT` | VPS のホスト鍵のフィンガープリント（`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` の `SHA256:...` 部分） |

秘密鍵は Secrets に登録したら手元から削除して構いません（作り直す場合は鍵ペアごと作り直す）。

---

## 5. ネットワーク・公開ポートの確認

- 公開してよいのは **80 番と 443 番（Nginx）のみ**です。`back-end`（3000）・`db`（5432）は
  `docker-compose.yml` 上でホストに `ports` を公開していないため、外部から直接は到達できません。
  `docker compose ps` の `PORTS` 列で 3000 / 5432 がホストに出ていないことを確認してください。
- 正規の URL は `https://www.vegetask.net/` です。80 番は Let's Encrypt の認証
  （`/.well-known/acme-challenge/`）とリダイレクト専用で、それ以外はすべて
  `https://www.vegetask.net/` へ 301 リダイレクトします。`https://vegetask.net/`（www なし）も
  同様に www 付きへリダイレクトします。
- 外部からの到達可否は、**さくらのコントロールパネルの「パケットフィルタ」**で制御します。
  80 / 443 番（と SSH）のみを許可してください。443 が無ければ追加します。
- 現行の VPS には `ufw` は入っておらず、ホストの nftables にあるのは Docker が自動で管理する
  ルールだけです（2026-09-29 確認）。ホスト側で追加のファイアウォール設定は不要です。
  なお、仮に `ufw` を入れても、Docker が `ports` で公開したポートは `ufw` のルールを経由せずに
  転送されるため、公開ポートの制限には使えません。公開範囲は `docker-compose.yml` の `ports` と
  パケットフィルタで管理します。

  ```bash
  sudo nft list ruleset | less   # ホスト側のルール確認（Docker 管理のルールのみであること）
  ```

- パケットフィルタの確認は VPS 自身からでは行えません（自分の公開 IP 宛ての通信はフィルタを
  通らない）。**必ず VPS 以外の端末**から `https://www.vegetask.net/` にアクセスして確認します。

---

## 5.1 セキュリティ（Phase 3）

リポジトリ側（nginx のセキュリティヘッダー・ログイン／サインアップのレート制限、CI の
`govulncheck` / `npm audit`）はコードに入っている。以下は **VPS で残る作業**。

### 本番モード（`GIN_MODE`）

`/opt/vegetask/.env` に次を追加し、back-end を再起動する。

```bash
# .env の末尾に追記
GIN_MODE=release

cd /opt/vegetask
docker compose up -d back-end
docker compose logs back-end --tail=30   # [GIN-debug] が出ていないこと
```

### `.env` の権限

```bash
ls -l /opt/vegetask/.env          # `-rw-rw----`（660）であること
getfacl /opt/vegetask/.env        # others に権限が無いこと
```

ずれていれば「2.」の権限手順をやり直す。

### セキュリティヘッダーとレート制限の確認

マージ後に `git pull` → `docker compose up -d --build front` したあと、VPS 以外の端末で:

```bash
curl -sI https://www.vegetask.net/ | grep -i -E '^(HTTP|strict-transport|x-content-type|x-frame)'
# Strict-Transport-Security / X-Content-Type-Options: nosniff / X-Frame-Options: DENY
```

`/api/login` と `/api/signup` は IP あたり 10 回/分（バースト 5）を超えると 429 になる。

### SSH 強化（鍵が全員分登録されてから）

パスワードしか使っていないメンバーが残っていると、以降入れなくなる。先に全員が
鍵認証でログインできることを確認する。

`/etc/ssh/sshd_config` または `/etc/ssh/sshd_config.d/*.conf` で次を設定する。

```
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
```

変更後:

```bash
sudo sshd -t && sudo systemctl reload ssh
```

別の端末から鍵で入れることを確認してから、今のセッションを切る。必要なら:

```bash
sudo apt-get install -y fail2ban
sudo systemctl enable --now fail2ban
```

### DB バックアップ

`pg_dump` をホストで定期実行し、結果を VPS の外へコピーする。例（毎日 3:00、7 日分残す）:

```bash
sudo mkdir -p /var/backups/vegetask
sudo chgrp vegetask-dev /var/backups/vegetask
sudo chmod 770 /var/backups/vegetask

sudo tee /etc/cron.d/vegetask-pgdump > /dev/null <<'EOF'
0 3 * * * root cd /opt/vegetask && docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > /var/backups/vegetask/vegetask-$(date +\%Y\%m\%d).sql && find /var/backups/vegetask -name 'vegetask-*.sql' -mtime +7 -delete
EOF
```

ダンプファイルは VPS 障害で一緒に消えるので、週 1 回でもよいので自分の PC へコピーする。

```bash
scp <ユーザー名>@133.125.60.179:/var/backups/vegetask/vegetask-*.sql .
```

---

## 6. ロールバック

基本は、問題のある PR を GitHub 上で revert する PR を作ってマージします（CD がそのまま反映します）。

急ぎで戻したい場合は、サーバーで対象のコミットへ戻して再ビルドします。次に `main` へ
マージされたときは、CD が最新の `main` に戻します。

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
  ボリュームの肥大化）。初回デプロイ直後の時点では、ビルドキャッシュが約 2GB あります。
  ディスクが逼迫したら `docker builder prune` で回収できますが、消すと次回の back-end
  ビルドで依存取得からやり直しになります。
- 現行の VPS はメモリが少ない（455MiB、スワップ 2GiB）ため、ビルド中は空きメモリが
  100MiB 程度まで減ります。ビルド中に他の重い作業をしないでください。

---

## 8. トラブルシューティング

| 症状 | 確認・対処 |
|---|---|
| `back-end` が起動直後に落ちる（再起動を繰り返す） | `docker compose logs back-end` で DB 接続エラーかを確認。`db` の healthcheck が通るまで `back-end` は起動しない設計だが、`./.env` の `DB_HOST` / `DB_USER` / `DB_PASS` / `DB_NAME` が `docker-compose.yml` 上の `db` の設定と一致しているか確認する。 |
| 日本語のファイル名（`/野菜L/...` など）の静的アセットが 404 になる | `front-end/nginx.conf` の `charset utf-8;` 設定と、`npm run build` の成果物（`dist/`）が正しくイメージに含まれているか確認する。 |
| `/api/subtasks/today` など日付に依存する API が 500 になる | back-end イメージに `tzdata` が入っているか（`back-end/Dockerfile` の `apk add --no-cache tzdata ca-certificates`）を確認する。 |
| `docker compose up` 時に `.env` のキー不足でエラーになる | README.md の「環境変数」表と `./.env` を突き合わせ、不足しているキーを追記する。 |
| `/api/login` や `/api/signup` が 429 になる | nginx のレート制限（IP あたり 10 回/分）。短時間の連打で発生したら数分待って再試行する。 |
| `front` が起動直後に落ちる（ログに `cannot load certificate`） | 証明書が未取得か、パスが違う。`sudo ls /etc/letsencrypt/live/www.vegetask.net/` を確認し、無ければ 3.1 の手順で取得する。 |
| ブラウザで証明書の期限切れエラーが出る | `sudo certbot certificates` で有効期限を確認。更新済みなのに古い証明書が出る場合は `docker compose exec front nginx -s reload` を実行し、3.1 の 4. のデプロイフックが置かれているか確認する。 |
| `certbot renew` が失敗する | `http://www.vegetask.net/.well-known/acme-challenge/test` に届くか確認する（`/var/www/certbot` のマウント、80 番の開放、DNS）。 |
| ページの再読み込みや `/tasks` への直アクセスで 404 になる | `front-end/nginx.conf` の `location /` に `try_files $uri $uri/ /index.html;`（SPA フォールバック）が設定されているか確認する。 |

---
