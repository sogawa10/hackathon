import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

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

        console.log("取得したタスク一覧:", data);

        setTasks(data || []);
      } catch (err: any) {
        setError(err.message || 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [API_BASE_URL, navigate]);

  return (
    <Layout>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '30px' }}>
          <h1 style={{ margin: 0, color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.2em' }}>📋</span> タスク一覧
          </h1>
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
                onClick={() => navigate(`/tasks/${task.task_id}`)}
                style={{
                  border: '1px solid #e0e0e0', borderRadius: '12px', padding: '20px', 
                  backgroundColor: '#fff', boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                  display: 'flex', alignItems: 'center', gap: '20px',
                  cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.05)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ width: '80px', flexShrink: 0 }}>
                  <span style={{ fontSize: '12px', color: '#fff', backgroundColor: '#81c784', padding: '4px 10px', borderRadius: '12px', display: 'inline-block' }}>
                    {task.task_type}
                  </span>
                </div>

                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: '0 0 8px 0', color: '#333', fontSize: '18px' }}>{task.task_title}</h3>
                  <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                    期間: {task.start_date.split('T')[0]} 〜 {task.end_date.split('T')[0]} / 全{task.total_count}単位
                  </p>
                </div>
                
                <div style={{ 
                  textAlign: 'center', 
                  backgroundColor: '#f9fbe7', 
                  padding: '12px 20px', 
                  borderRadius: '8px', 
                  minWidth: '100px'
                }}>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#558b2f' }}>
                    {task.vegetable_name || '未設定'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Tasks;