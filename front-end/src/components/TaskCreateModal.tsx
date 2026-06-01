import React from 'react';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
}

const TaskCreateModal: React.FC<TaskCreateModalProps> = ({ isOpen, onClose, onTaskCreated }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#fff',
        padding: '24px',
        borderRadius: '12px',
        width: '400px',
        maxWidth: '90%',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ marginTop: 0, color: '#333' }}>タスク作成</h2>
        
        <div style={{ margin: '20px 0' }}>
          <p style={{ color: '#666', fontSize: '14px' }}>
            ※ここにタスクタイトルや期間などの入力フォームを配置します
          </p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
          <button 
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              color: '#555'
            }}
          >
            キャンセル
          </button>
          <button 
            onClick={onTaskCreated}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4caf50',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            作成する
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskCreateModal;