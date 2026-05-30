package handlers

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// フロントから送られてきた通行証（トークン）を確認し、中身のuser_idを取り出す
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 1. ヘッダーから通行証（Authorization）を受け取る
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "トークンがありません。ログインしてください。"})
			c.Abort() // 処理をここで止める
			return
		}

		// 2. "Bearer トークンの文字列" という形になっているかチェック
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "トークンの形式が不正です"})
			c.Abort()
			return
		}

		tokenString := parts[1]
		secret := []byte(os.Getenv("JWT_SECRET"))

		// 3. トークンが本物か（改ざんされていないか・期限切れでないか）検証する
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return secret, nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "無効または期限切れのトークンです"})
			c.Abort()
			return
		}

		// 4. トークンの中から "user_id" を取り出す
		if claims, ok := token.Claims.(jwt.MapClaims); ok {
			if userID, ok := claims["user_id"].(string); ok {
				c.Set("user_id", userID)
			} else {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "トークンにユーザーIDが含まれていません"})
				c.Abort()
				return
			}
		}

		// 全てのチェックを通過したら、本来の処理（タスク登録など）へ進む
		c.Next()
	}
}
