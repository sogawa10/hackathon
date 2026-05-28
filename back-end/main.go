package main

import (
	"database/sql"
	"fmt"
	"log"
	"os" // 環境変数を扱うパッケージ

	"back-end/handlers"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {

	// 1. .env ファイルを読み込む
	err := godotenv.Load()
	if err != nil {
		log.Println("⚠️ .envファイルが見つかりません。OSの環境変数を使用します。")
	}

	// 2. 環境変数から値を取り出して、DB接続用の文字列を組み立てる
	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASS"),
		os.Getenv("DB_NAME"),
	)

	// 3. データベースへの接続
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("DB接続設定エラー: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("DB接続エラー: %v", err)
	}
	fmt.Println("🎉 PostgreSQL への接続成功！（環境変数を使用）")

	// ルーター設定とサーバー起動
	r := gin.Default()
	r.POST("/api/signup", handlers.SignupHandler(db))
	r.POST("/api/login", handlers.LoginHandler(db))
	r.GET("/api/subtasks/today", handlers.GetTodaySubtasksHandler(db))
	r.POST("/api/tasks", handlers.CreateTaskHandler(db))
	r.POST("/api/vegetable/:task_id", handlers.AssignVegetableHandler(db))

	fmt.Println("🚀 VegeTask サーバーがポート3000番で起動しました")
	r.Run(":3000")
}
