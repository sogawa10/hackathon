package main

import (
	"back-end/handlers"
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println(".envファイルが見つかりません。OSの環境変数を使用します。")
	}

	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		os.Getenv("DB_HOST"),
		os.Getenv("DB_PORT"),
		os.Getenv("DB_USER"),
		os.Getenv("DB_PASS"),
		os.Getenv("DB_NAME"),
	)

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("DB接続設定エラー: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("DB接続エラー: %v", err)
	}
	fmt.Println("PostgreSQL への接続成功！")

	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:5173"},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	r.POST("/api/signup", handlers.SignupHandler(db))
	r.POST("/api/login", handlers.LoginHandler(db))

	authGroup := r.Group("/")
	authGroup.Use(handlers.AuthMiddleware())
	{
		authGroup.GET("/api/subtasks/today", handlers.GetTodaySubtasksHandler(db))
		authGroup.POST("/api/tasks", handlers.CreateTaskHandler(db))
		authGroup.POST("/api/vegetable/:task_id", handlers.AssignVegetableHandler(db))
	}

	fmt.Println("VegeTask サーバーがポート3000番で起動しました。")
	r.Run(":3000")
}
