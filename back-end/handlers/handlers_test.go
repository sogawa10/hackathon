package handlers

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// DB を使わない純粋関数の単体テスト。統合テストは back-end/main_test.go。

func TestGetVegetableSize(t *testing.T) {
	cases := map[string]string{
		"プチトマト": "S", "オクラ": "S", "枝豆": "S", "シイタケ": "S", "ネギ": "S",
		"赤パプリカ": "M", "ピーマン": "M", "なす": "M", "キュウリ": "M", "タケノコ": "M",
		"キャベツ": "L", "かぼちゃ": "L", "トウモロコシ": "L", "ブロッコリー": "L", "カリフラワー": "L",
		"スイカ": "Unknown", "": "Unknown",
	}
	for name, want := range cases {
		if got := getVegetableSize(name); got != want {
			t.Errorf("getVegetableSize(%q) 期待 %s, 実際 %s", name, want, got)
		}
	}
}

func TestFieldPlacementOrder(t *testing.T) {
	if len(fieldPlacementOrder) != 25 {
		t.Fatalf("スロット数 期待25, 実際 %d", len(fieldPlacementOrder))
	}
	if fieldPlacementOrder[0] != 12 {
		t.Fatalf("最初のスロットは畑の中央(12)であるべき: 実際 %d", fieldPlacementOrder[0])
	}
	seen := map[int]bool{}
	for _, s := range fieldPlacementOrder {
		if s < 0 || s > 24 {
			t.Fatalf("範囲外のスロット %d", s)
		}
		if seen[s] {
			t.Fatalf("スロット %d が重複している", s)
		}
		seen[s] = true
	}
}

func TestGenerateTokens(t *testing.T) {
	t.Setenv("JWT_SECRET", "unit-test-secret")
	const userID = "11111111-1111-1111-1111-111111111111"

	access, refresh, err := generateTokens(userID)
	if err != nil {
		t.Fatalf("トークン発行に失敗: %v", err)
	}

	check := func(label, tokenStr string, wantTTL time.Duration) {
		t.Helper()
		claims := jwt.MapClaims{}
		_, err := jwt.ParseWithClaims(tokenStr, claims, func(tk *jwt.Token) (any, error) {
			if tk.Method != jwt.SigningMethodHS256 {
				t.Fatalf("%s: 署名アルゴリズム 期待HS256, 実際 %v", label, tk.Method.Alg())
			}
			return []byte("unit-test-secret"), nil
		})
		if err != nil {
			t.Fatalf("%s: 検証に失敗: %v", label, err)
		}
		if claims["user_id"] != userID {
			t.Fatalf("%s: user_id 期待 %s, 実際 %v", label, userID, claims["user_id"])
		}
		exp, err := claims.GetExpirationTime()
		if err != nil || exp == nil {
			t.Fatalf("%s: exp が無い: %v", label, err)
		}
		if d := time.Until(exp.Time) - wantTTL; d > time.Minute || d < -time.Minute {
			t.Fatalf("%s: 有効期限 期待 約%v, 実際 %v", label, wantTTL, time.Until(exp.Time))
		}
	}
	check("アクセストークン", access, time.Hour)
	check("リフレッシュトークン", refresh, 7*24*time.Hour)
}
