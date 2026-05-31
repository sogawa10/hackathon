package handlers

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// [DELETE] タスク削除API
func DeleteTaskHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. URLから task_id を取得
		taskID := c.Param("task_id")
		if taskID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "task_id が指定されていません"})
			return
		}

		// 2. データベースからタスクを削除
		query := `DELETE FROM "TASKS" WHERE task_id = $1`
		result, err := db.Exec(query, taskID)
		if err != nil {
			log.Printf("タスク削除エラー: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			return
		}

		// 3. 削除された行数を確認
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			log.Printf("RowsAffected エラー: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "サーバー内部エラー"})
			return
		}

		if rowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "指定されたタスクが見つかりません"})
			return
		}

		// 4. 成功レスポンス
		c.JSON(http.StatusOK, gin.H{"message": "タスクを正常に削除しました"})
	}
}
