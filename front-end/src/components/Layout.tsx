import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from './Header';
import TaskCreateModal from './TaskCreateModal';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLimitPopupOpen, setIsLimitPopupOpen] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleNewTaskClick = async () => {
    if (isChecking) return;
    
    setIsChecking(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        alert('認証エラー: ログインし直してください。');
        navigate('/login', { replace: true });
        return;
      }

      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
      const res = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('タスクの取得に失敗しました');
      }

      const data = await res.json();
      const safeData = Array.isArray(data) ? data : [];
      
      const activeTasksCount = safeData.filter((t: any) => t.growth_stage !== -1 && t.growth_stage !== 11).length;

      if (activeTasksCount >= 25) {
        setIsLimitPopupOpen(true);
      } else {
        setIsModalOpen(true);
      }
    } catch (err: any) {
      console.error(err);
      alert('タスク状況の確認に失敗しました。');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <Header onNewTaskClick={handleNewTaskClick} />
      
      <main style={{ 
        flex: 1, 
        width: '100%', 
        padding: '2vh 2vw', 
        boxSizing: 'border-box',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {children}
      </main>
      
      <TaskCreateModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onTaskCreated={(msg) => {
          setIsModalOpen(false);
          if (location.pathname === '/home' || location.pathname === '/') {
            window.dispatchEvent(new CustomEvent('taskCreated', { detail: msg }));
          } else {
            navigate('/home', { state: { systemMessage: msg } });
          }
        }}
      />

      {isLimitPopupOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: '#fff',
            padding: '32px',
            borderRadius: '16px',
            textAlign: 'center',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            maxWidth: '400px',
            width: '90%',
            animation: 'fadeIn 0.2s ease-in-out'
          }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🚫</div>
            <h3 style={{ margin: '0 0 16px 0', color: '#c62828', fontSize: '20px' }}>
              これ以上畑に野菜を植えられません！
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#555', fontSize: '15px', lineHeight: '1.6' }}>
              現在、畑のマス（25個）がすべて埋まっています。<br />
              先にタスクを完了して、<br />野菜を収穫してください！
            </p>
            <button 
              onClick={() => setIsLimitPopupOpen(false)}
              style={{
                backgroundColor: '#f5f5f5',
                color: '#333',
                border: '1px solid #ddd',
                padding: '10px 24px',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e0e0e0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;