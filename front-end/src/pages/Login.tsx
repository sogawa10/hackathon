import React, { useState } from 'react';
import { login } from '../services/auth';
import { useNavigate } from 'react-router-dom';

const Login: React.FC = () => {
  // 入力値を state で管理
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // 画面遷移用
  const navigate = useNavigate();

  // フォームの送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 簡易バリデーション
    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // Step 2-2-2-3-1 で作成した API 呼び出しを実行
      const data = await login({ email, password });

      // アクセストークンをローカルストレージへ保存（基本的な実装）
      localStorage.setItem('access_token', data.access_token);

      // ログイン成功時の遷移（ここではホーム `/` へ遷移）
      navigate('/', { replace: true });
    } catch (err: any) {
      // エラーメッセージを UI に表示
      setError(err?.message ?? 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container" style={{ maxWidth: 400, margin: '0 auto', padding: 20 }}>
      <h2>ログイン</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="email" style={{ display: 'block', marginBottom: 6 }}>メールアドレス</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label htmlFor="password" style={{ display: 'block', marginBottom: 6 }}>パスワード</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
          />
        </div>

        {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
          {loading ? 'ログイン中…' : 'Login'}
        </button>
      </form>
    </div>
  );
};

export default Login;