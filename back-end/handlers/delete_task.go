package handlers

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func DeleteTaskHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskID := c.Param("task_id")
		if taskID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "task_id が指定されていません"})
			return
		}

		query := `DELETE FROM "TASKS" WHERE task_id = $1`
		result, err := db.Exec(query, taskID)
		if err != nil {
			log.Printf("タスク削除エラー: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "データベースエラーが発生しました"})
			return
		}

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

		c.JSON(http.StatusOK, gin.H{"message": "タスクを正常に削除しました"})
	}
}
