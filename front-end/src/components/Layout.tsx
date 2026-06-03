import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Header from './Header';
import TaskCreateModal from './TaskCreateModal';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header onNewTaskClick={() => setIsModalOpen(true)} />
      <main style={{ flex: 1, padding: '20px' }}>
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
    </div>
  );
};

export default Layout;