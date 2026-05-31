import React, { useState } from 'react';
import { login } from '../services/auth';
import { useNavigate, Link } from 'react-router-dom';

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
      
      localStorage.setItem('access_token', data.access_token);
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }

      navigate('/home', { replace: true });
    } catch (err: any) {
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

        <button type="submit" disabled={loading} style={{ padding: '8px 16px', width: '100%' }}>
          {loading ? 'ログイン中…' : 'Login'}
        </button>
      </form>

      <div style={{ marginTop: 24, textAlign: 'center', fontSize: '14px' }}>
        アカウントをお持ちでないですか？<br />
        <Link 
          to="/signup" 
          style={{ color: '#007bff', textDecoration: 'underline', marginTop: '8px', display: 'inline-block' }}
        >
          新規登録はこちら
        </Link>
      </div>
    </div>
  );
};

export default Login;