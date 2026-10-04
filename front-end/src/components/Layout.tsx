import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from './Header';
import TaskCreateModal from './TaskCreateModal';
import './Layout.css';

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
    <div className="app-shell">
      <Header onNewTaskClick={handleNewTaskClick} />

      <main className="app-main">
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
        <div className="dialog-backdrop" onClick={() => setIsLimitPopupOpen(false)}>
          <div
            className="dialog dialog-alert"
            role="alertdialog"
            aria-labelledby="limit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="limit-title" className="dialog-title">畑がいっぱいです</h2>
            <p>
              畑の 25 マスがすべて埋まっています。育ち切った野菜を収穫すると、新しいタスクを植えられます。
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-primary" autoFocus onClick={() => setIsLimitPopupOpen(false)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
