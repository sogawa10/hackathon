CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. ユーザー管理テーブル
CREATE TABLE "USERS" (
    "user_id"   UUID PRIMARY KEY,
    "user_name" VARCHAR(255) NOT NULL UNIQUE,
    "user_pass" VARCHAR(255) NOT NULL
);

-- 2. 野菜マスタテーブル
CREATE TABLE "VEGETABLES" (
    "vegetable_id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "vegetable_name"   VARCHAR(255) NOT NULL UNIQUE,
    "size"             VARCHAR(10) NOT NULL,
    CONSTRAINT "check_vegetable_size" CHECK ("size" IN ('S', 'M', 'L'))
);

-- 3. タスク（苗）テーブル
CREATE TABLE "TASKS" (
    "task_id"      UUID PRIMARY KEY,
    "user_id"      UUID NOT NULL REFERENCES "USERS" ("user_id"),
    "vegetable_id" UUID REFERENCES "VEGETABLES" ("vegetable_id"),
    "task_type"    VARCHAR(50) NOT NULL,
    "task_title"   VARCHAR(255) NOT NULL,
    "start_date"   DATE NOT NULL, 
    "end_date"     DATE NOT NULL,
    "total_count"  INTEGER NOT NULL,
    "lap_count"    INTEGER NOT NULL DEFAULT 1,
    "buffer_days"  INTEGER NOT NULL,
    "growth_stage" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "check_task_dates" CHECK ("end_date" >= "start_date"),
    CONSTRAINT "check_task_counts" CHECK ("total_count" >= 0 AND "lap_count" >= 1 AND "buffer_days" >= 1),
    CONSTRAINT "check_growth_stage" CHECK ("growth_stage" BETWEEN -1 AND 11),
    CONSTRAINT "check_task_type" CHECK ("task_type" IN ('問題集', '単語帳', '過去問', 'その他'))
);

-- 4. サブタスク（日ごとのToDo）テーブル
CREATE TABLE "SUB_TASKS" (
    "sub_task_id"    UUID PRIMARY KEY,
    "task_id"        UUID NOT NULL REFERENCES "TASKS" ("task_id") ON DELETE CASCADE,
    "scheduled_date" DATE NOT NULL,
    "task_content"   VARCHAR(255) NOT NULL,
    "is_completed"   BOOLEAN NOT NULL DEFAULT FALSE
);

-- 5. 収穫履歴テーブル
CREATE TABLE "HARVESTS" (
    "harvest_id"   UUID PRIMARY KEY,
    "user_id"      UUID NOT NULL REFERENCES "USERS" ("user_id"),
    "task_id"      UUID NOT NULL REFERENCES "TASKS" ("task_id"),
    "vegetable_id" UUID NOT NULL REFERENCES "VEGETABLES" ("vegetable_id"),
    "harvested_at" DATE NOT NULL
);
