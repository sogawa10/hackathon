import React, { useState } from 'react';
import { login } from '../services/auth';
import { useNavigate, Link } from 'react-router-dom';
import './Auth.css';

const Login: React.FC = () => {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      setError('ユーザー名とパスワードを入力してください');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const data = await login({ user_name: username, user_pass: password });
      
      const responseData = Array.isArray(data) ? data[0] : data;

      if (!responseData || !responseData.access_token) {
        throw new Error('トークンの取得に失敗しました');
      }

      localStorage.setItem('access_token', responseData.access_token);
      if (responseData.refresh_token) {
        localStorage.setItem('refresh_token', responseData.refresh_token);
      }

      navigate('/home', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2 className="auth-title">ログイン</h2>
      <form onSubmit={handleSubmit}>
        <div className="auth-input-group">
          <label htmlFor="username" className="auth-label">ユーザー名</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="auth-input"
            placeholder="ユーザー名を入力"
          />
        </div>

        <div className="auth-input-group">
          <label htmlFor="password" className="auth-label">パスワード</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            placeholder="パスワードを入力"
          />
        </div>

        {error && <div style={{ color: 'red', marginBottom: '12px', textAlign: 'center' }}>{error}</div>}

        <button type="submit" disabled={loading} className="auth-button">
          {loading ? 'ログイン中…' : 'Login'}
        </button>
      </form>

      <div className="auth-link-text">
        アカウントをお持ちでないですか？<br />
        <Link to="/signup" className="auth-link">
          新規登録はこちら
        </Link>
      </div>
    </div>
  );
};

export default Login;