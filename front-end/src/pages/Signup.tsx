import React, { useState } from 'react';
import { signup } from '../services/auth';
import { useNavigate } from 'react-router-dom';

const Signup: React.FC = () => {
  // 入力値を state で管理
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // 画面遷移用
  const navigate = useNavigate();

  // フォーム送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 簡易バリデーション
    if (!username || !password) {
      setError('ユーザー名とパスワードを入力してください');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // signup API 呼び出し
      const data = await signup({ user_name: username, user_pass: password });

      // アクセストークンをローカルストレージへ保存（基本的な実装）
      localStorage.setItem('access_token', data.access_token);

      // 登録成功後の遷移（ここではホーム `/` へ遷移）
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'ユーザー登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signup-container" style={{ maxWidth: 400, margin: '0 auto', padding: 20 }}>
      <h2>新規登録</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label htmlFor="username" style={{ display: 'block', marginBottom: 6 }}>ユーザー名</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: '100%', padding: 8, boxSizing: 'border-box' }}
            placeholder="ユーザー名を入力"
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
            placeholder="パスワードを入力"
          />
        </div>

        {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}

        <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
          {loading ? '登録中…' : 'Sign Up'}
        </button>
      </form>
    </div>
  );
};

export default Signup;