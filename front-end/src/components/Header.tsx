import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  onNewTaskClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onNewTaskClick }) => {
  const navigate = useNavigate();
  const [isConfirmingLogout, setIsConfirmingLogout] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setIsConfirmingLogout(false);
      }
    };

    if (isConfirmingLogout) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isConfirmingLogout]);

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
      backgroundColor: '#fff',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      <button onClick={() => navigate('/basket')} style={buttonStyle}>🧺 かご</button>
      <button onClick={onNewTaskClick} style={buttonStyle}>➕ 新規タスク登録</button>
      <button onClick={() => navigate('/home')} style={buttonStyle}>🏠 ホーム</button>
      <button onClick={() => navigate('/tasks')} style={buttonStyle}>📋 タスク一覧</button>
      
      <div style={{ position: 'relative' }} ref={popupRef}>
        <button 
          onClick={() => setIsConfirmingLogout(!isConfirmingLogout)} 
          style={{ ...buttonStyle, color: '#e53935' }}
        >
          🚪 ログアウト
        </button>
        
        {isConfirmingLogout && (
          <div style={{ 
            position: 'absolute',
            top: '100%',
            right: '0',
            marginTop: '10px',
            backgroundColor: '#fff',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            width: 'max-content',
            zIndex: 1001,
            animation: 'fadeIn 0.2s ease-in-out'
          }}>
            <span style={{ fontSize: '14px', color: '#333', fontWeight: 'bold', textAlign: 'center' }}>本当にログアウトしますか？</span>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button 
                onClick={() => setIsConfirmingLogout(false)} 
                style={{ ...buttonStyle, padding: '6px 16px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}
              >
                キャンセル
              </button>
              <button 
                onClick={handleLogout} 
                style={{ ...buttonStyle, padding: '6px 16px', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '4px' }}
              >
                はい
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;