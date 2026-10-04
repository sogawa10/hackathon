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

      if (!data || !data.access_token) {
        throw new Error('トークンの取得に失敗しました');
      }

      localStorage.setItem('access_token', data.access_token);
      localStorage.removeItem('refresh_token');

      navigate('/home', { replace: true });
    } catch (err: any) {
      setError(err?.message ?? 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
    <div className="auth-container">
      <img src="/VegeTASK_ロゴ.png" alt="VegeTASK 勉強を育て、収穫するタスク管理アプリ" className="auth-logo" />
      <h1 className="auth-title">ログイン</h1>
      <form onSubmit={handleSubmit} noValidate>
        <div className="auth-input-group">
          <label htmlFor="username" className="field-label">ユーザー名</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="field-input"
            autoComplete="username"
          />
        </div>

        <div className="auth-input-group">
          <label htmlFor="password" className="field-label">パスワード</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field-input"
            autoComplete="current-password"
          />
        </div>

        {error && <p className="form-error auth-error" role="alert">{error}</p>}

        <button type="submit" disabled={loading} className="btn btn-primary auth-button">
          {loading ? 'ログインしています…' : 'ログイン'}
        </button>
      </form>

      <div className="auth-link-text">
        はじめて使う方は
        <Link to="/signup" className="auth-link">
          アカウントを作る
        </Link>
      </div>
    </div>
    </div>
  );
};

export default Login;