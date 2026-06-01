import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

type Task = {
  task_id: string;
  task_type: string;
  task_title: string;
  total_count: number;
  start_date: string;
  end_date: string;
  vegetable_name: string;
};

const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          throw new Error('認証トークンが見つかりません。再ログインしてください。');
        }

        const res = await fetch(`${API_BASE_URL}/api/tasks`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.status === 401) {
          localStorage.removeItem('access_token');
          navigate('/login', { replace: true });
          return;
        }

        if (!res.ok) {
          throw new Error('タスクの取得に失敗しました');
        }

        const data = await res.json();

        setTasks(data || []);
      } catch (err: any) {
        setError(err.message || 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [API_BASE_URL, navigate]);

  const handleDelete = async (taskId: string, taskTitle: string) => {

    if (!window.confirm(`「${taskTitle}」を本当に削除しますか？\n※この操作は取り消せません。`)) {
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error('タスクの削除に失敗しました');
      }

      setTasks((prev) => prev.filter((task) => task.task_id !== taskId));
      
    } catch (err: any) {
      alert(err.message || 'エラーが発生しました');
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px' }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
          <button 
            onClick={() => navigate('/home')}
            style={{
              padding: '8px 16px', backgroundColor: '#e0e0e0', border: 'none', 
              borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            ←畑ページへ
          </button>
        </div>

        <h1 style={{ margin: 0, color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '1.2em' }}>📋</span> タスク一覧
        </h1>

        <div style={{ flex: 1 }}></div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>読み込み中...</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#e53935', fontWeight: 'bold' }}>{error}</div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888', backgroundColor: '#f5f5f5', borderRadius: '12px' }}>
          現在登録されているタスクはありません。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {tasks.map(task => (
            <div 
              key={task.task_id} 
              style={{
                border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px', 
                backgroundColor: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
            >
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '12px', color: '#fff', backgroundColor: '#81c784', padding: '4px 10px', borderRadius: '12px', display: 'inline-block', marginBottom: '8px' }}>
                  {task.task_type}
                </span>
                <h3 style={{ margin: '0 0 8px 0', color: '#333', fontSize: '18px' }}>{task.task_title}</h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                  期間: {task.start_date.split('T')[0]} 〜 {task.end_date.split('T')[0]} / 全{task.total_count}単位
                </p>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ textAlign: 'center', backgroundColor: '#f9fbe7', padding: '10px 20px', borderRadius: '8px', minWidth: '80px' }}>
                  <div style={{ fontSize: '24px' }}>🌱</div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#558b2f' }}>{task.vegetable_name || '未設定'}</div>
                </div>
                
                <button
                  onClick={() => handleDelete(task.task_id, task.task_title)}
                  style={{
                    backgroundColor: '#fff',
                    color: '#e53935',
                    border: '1px solid #ffcdd2',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#ffebee';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#fff';
                  }}
                >
                  🗑️ 削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Tasks;