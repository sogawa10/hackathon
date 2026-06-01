# VegeTASK

<img width="549" height="612" alt="Image" src="https://github.com/user-attachments/assets/690316de-9719-4d19-874e-2df2bdfee8c4" />


## 概要

- 勉強を「**野菜を育てること**」に見立てたタスク管理アプリ

- 収穫した野菜をかごに溜めていく


## ポイント

- **一日当たりのタスク**（小タスク）に自動で分割してくれる

- タスク達成が「**野菜の成長と収穫**」というわかりやすい報酬になる

- **サボると損をする**仕組みで継続を促せる

- **溜まった野菜**で達成の積み重ねが見える


## アプリ利用の流れ

1. ユーザー登録

    - ユーザー名とパスワードを入力
  
2. ログイン

    - ユーザー名とパスワードを入力
  
3. タスクを入力して**野菜の種**をもらう

    - 小タスクの**難易度**と**実施期間**によってもらえる野菜の種が変わる（野菜S，野菜M，野菜L）

    - タスク実施期間の**10%**が**予備日**として割り当てられる

    - 1週間未満のタスクは入力不可
  
4. タスク開始日に種が植えられる

5. 毎日，小タスクをこなしたら**チェック**を付けていく

6. 小タスクをこなさなかった日は野菜が**成長しない**

    - こなさなかった場合は，予備日が消費される

    - 予備日を消費しきったら**野菜が枯れる**

7. 小タスクをすべて完了すると野菜を収穫できるようになる

8. **野菜を収穫**し，タスクを完了する

9. 収穫された野菜は**かご**に溜まっていく


## システムの仕様書

### タスクの種類と入力の型

- **問題集**： <開始日> から <期日> までに <問題集名> を <問題数> 問解く

- **単語帳**： <開始日> から <期日> までに <単語帳名> で <単語数> 語を <周数> 周して覚える

- **過去問**： <開始日> から <期日> までに <大学名・学部・方式・教科> を <年数> 年分解く

- **その他**： <開始日> から <期日> までに <やること> を <ぺージ数> する

### 野菜の種類と割当アルゴリズム

1. 野菜の種類

- **野菜S**

    - プチトマト

    - オクラ

    - 枝豆

    - シイタケ

    - ネギ

- **野菜M**

    - 赤パプリカ

    - ピーマン

    - なす

    - キュウリ

    - タケノコ

- **野菜L**

    - キャベツ

    - かぼちゃ

    - トウモロコシ

    - ブロッコリー

    - カリフラワー

2. 野菜の割当アルゴリズム

**基本方針**

タスクごとに 難易度スコア（D） と 期間スコア（P） を計算し，合計した 総合スコア（S） で野菜サイズを決定する

- 実施日数 = 期日 - 開始日 + 1

- 予備日（切り上げ） = ⌈ 実施日数 × 0.1 ⌉

- 有効日数 = 実施日数 - 予備日

**Step1**: 難易度スコア(D)の計算

⓵ タスク種別のスコア
| タスクの種類 | スコア |
| :---: | :---: |
| 問題集 | 1.5 |
| 単語帳 | 1.0 |
| 過去問 | 2.5 |
| その他 | 1.0 |

⓶ 1日あたりの分量に応じたスコア
| タスクの種類 | スコア |
| :---: | :---: |
| 問題集 | （問題数 ÷ 有効日数）× 0.7 |
| 単語帳 | （単語数×周数 ÷ 有効日数）× 0.01 |
| 過去問 | （年数 ÷ 有効日数）× 3.0 |
| その他 | （ページ数 ÷ 有効日数）× 0.3 |

D = タスク種別のスコア + 1日あたりの分量に応じたスコア

**Step2**: 期間スコア(P)の計算

⓵ 期間スコア
| 実施日数 | スコア |
| :---: | :---: |
| 7〜16日 | 0 |
| 17〜26日 | 0.4 |
| 27〜36日 | 0.8 |
| 37〜46日 | 1.2 |
| 47〜56日 | 1.6 |
| 56〜65日 | 2.0 |
| 65日〜 | 2.4 |

P = 期間スコア

**Step3**: 総合スコア(S)の計算

S = D + P

**Step4**: 野菜サイズの決定

| 総合スコア | 野菜サイズ |
| :---: | :---: |
| ～2.8 | 野菜S |
| 2.8～5.0 | 野菜M |
| 5.0～ | 野菜L |

### バックエンドの仕様

**ER図**

<img width="679" height="561" alt="Image" src="https://github.com/user-attachments/assets/7f97e690-82a8-461c-8874-133ca8a4e8fc" />

**補足：「growth_stage」について**

< -1 > → 枯れた状態

< 0 > → 種の状態

< 1 ~ 10 > → 畑にて成長中

< 11 > → 収穫済み


**ユーザー登録**（**POST** `api/signup`）

リクエスト (JSON)

```json
[
  {
    "user_name": "user_name",
    "user_pass": "user_pass"
  }
]
```

レスポンス (JSON)

```json
[
  {
    "user_id": "UUID",
    "access_token": "access_token",
    "refresh_token": "refresh_token"
  }
]
```

**ログイン**（**POST** `api/login`）

リクエスト (JSON)

```json
[
  {
    "user_name": "user_name",
    "user_pass": "user_pass"
  }
]
```

レスポンス (JSON)

```json
[
  {
    "user_id": "UUID",
    "access_token": "accesstoken",
    "refresh_token": "refresh_token"
  }
]
```

**今日のToDo取得**（**GET** `api/subtasks/today`）

→ アクセストークンが必要

レスポンス (JSON)

```json
[
  {
    "sub_task_id": "UUID",
    "task_id": "UUID",
    "scheduled_date": "YYYY-MM-DD",
    "task_type": "単語帳 | 問題集 | 過去問 | その他",
    "task_title": "task_title",
    "task_content": "String（何問 or 何単語 など）",
    "is_completed": "Boolean",
    "vegetable_name": "vegetable_name",
    "growth_stage": "-1〜11"
  }
]
```

**ToDoにチェックをつける**（**PATCH** `api/subtasks`）

→ アクセストークンが必要

リクエスト (JSON)

```json
[
  {
    "sub_task_id": "UUID",
  }
]
```

レスポンス (JSON)

```json
[
  {
    "growth_stage": "-1〜11"
  }
]
```

**野菜の収穫**（**POST** `api/tasks/harvest`）

→ アクセストークンが必要

リクエスト (JSON)

```json
[
  {
    "task_id": "UUID"
  }
]
```

レスポンス (JSON)

```json
[
  {
    "harvest_id": "UUID",
    "vegetable_name": "vegetable_name",
    "size": "S | M | L"
  }
]
```

**タスク登録**（**POST** `api/tasks`）

→ アクセストークンが必要

リクエスト (JSON)

```json
[
  {
    "task_type": "単語帳 | 問題集 | 過去問 | その他",
    "task_title": "task_title",
    "total_count": "total_count（問題量）",
    "lap_count": "lap_count（周回数：デフォルトは1）",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD"
  }
]
```

レスポンス (JSON)

```json
[
  {
    "task_id": "UUID",
    "size": "S | M | L"
  }
]
```

**野菜をタスクに割り当てる**（**POST** `api/vegetable/{task_id}`）

パスパラメータ

`task_id` には，野菜を割り当てたいタスクのIDを入力する

リクエスト (JSON)

```json
[
  {
    "vegetable_name": "vegetable_name"
  }
]
```

レスポンス (JSON)

```json
[
  {
    "task_id": "UUID"
  }
]
```

**タスク一覧取得**（**GET** `api/tasks`）

→ アクセストークンが必要

レスポンス (JSON)

```json
[
  {
    "task_id": "UUID",
    "task_type": "単語帳 | 問題集 | 過去問 | その他",
    "task_title": "task_title",
    "total_count": "total_count（問題量）",
    "lap_count": "lap_count（周回数：デフォルトは1）",
    "start_date": "YYYY-MM-DD",
    "end_date": "YYYY-MM-DD",
    "buffer_days": "buffer_day（予備日数）",
    "vegetable_name": "vegetable_name",
    "growth_stage": "0〜9",
    "image_url": "url"
  }
]
```

**タスクの削除**（**DELETE** `api/tasks/{task_id}`）

→ アクセストークンが必要

パスパラメータ

`task_id` には，削除したいタスクのIDを入力する

**収穫された野菜一覧**（**GET** `api/harvest_basket`）

→ アクセストークンが必要

レスポンス (JSON)

```json
[
  {
    "harvest_id": "UUID",
    "task_id": "UUID",
    "vegetable_name": "vegetable_name",
    "vegetable_size": "S | M | L",
    "image_url": "image_url",
    "harvested_at": "YYYY-MM-DD"
  }
]
```

### フロントエンドの仕様

| ページ名 | 内容 | 利用API |
|---|---|---|
| 新規登録ページ | 新しいアカウントを作成する <br> 登録完了後，ホームページへ遷移する | `POST /api/signup` |
| ログインページ | ユーザー名とパスワードでログインする <br> ログイン成功後，ホームページへ遷移する | `POST /api/login` |
| ホームページ | 畑の状態を見る <br> 今日のToDoを見る <br> ToDo完了で野菜を成長させる <br> 収穫可能になった野菜を収穫できる | `GET /api/subtasks/today` <br> `PATCH /api/subtasks` <br> `POST /api/tasks/harvest` |
| タスク作成ページ | 新しいタスクを登録する <br> 作成時に野菜を選択し，種をもらう | `POST /api/tasks` <br> `POST /api/vegetable` |
| タスク一覧ページ | 作成済みタスクを一覧で見る <br> 各タスクを選択すると，タスク詳細ページへ遷移できる | `GET /api/tasks` |
| タスク詳細ページ | 1件のタスクの詳しい情報を見る <br> タスクを削除することもできる | `DELETE /api/tasks/{task_id}` |
| 収穫かごページ | 収穫済み野菜がかごに溜まっていくGUI | `GET /api/harvest_basket` |
