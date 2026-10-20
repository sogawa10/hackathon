package handlers

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

type VegetableResponse struct {
	VegetableName string `json:"vegetable_name"`
	VegetableSize string `json:"vegetable_size"`
}

func GetVegetablesHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := `
			SELECT vegetable_name, size
			FROM "VEGETABLES"
			ORDER BY CASE size WHEN 'S' THEN 1 WHEN 'M' THEN 2 ELSE 3 END, vegetable_name
		`
		rows, err := db.Query(query)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "野菜一覧の取得に失敗しました"})
			return
		}
		defer rows.Close()

		vegetables := []VegetableResponse{}
		for rows.Next() {
			var v VegetableResponse
			if err := rows.Scan(&v.VegetableName, &v.VegetableSize); err != nil {
				continue
			}
			vegetables = append(vegetables, v)
		}

		c.JSON(http.StatusOK, vegetables)
	}
}
