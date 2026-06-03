import React from 'react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onNewTaskClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onNewTaskClick }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login', { replace: true });
  };

  const buttonStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#333',
    padding: '10px'
  };

  return (
    <header style={{ 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      gap: '20px',
      padding: '15px 20px', 
      borderBottom: '1px solid #e0e0e0', 
      backgroundColor: '#fff' 
    }}>
      <button onClick={() => navigate('/basket')} style={buttonStyle}>🧺 かご</button>
      <button onClick={onNewTaskClick} style={buttonStyle}>➕ 新規タスク登録</button>
      <button onClick={() => navigate('/home')} style={buttonStyle}>🏠 ホーム</button>
      <button onClick={() => navigate('/tasks')} style={buttonStyle}>📋 タスク一覧</button>
      <button onClick={handleLogout} style={{ ...buttonStyle, color: '#e53935' }}>🚪 ログアウト</button>
    </header>
  );
};

export default Header;