import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

type Task = {
  task_id: string;
  task_type: string;
  task_title: string;
  total_count: number;
  lap_count: number;
  start_date: string;
  end_date: string;
  vegetable_name: string;
  growth_stage: number;
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

  const formatTaskCount = (task: Task) => {
    switch (task.task_type) {
      case '問題集':
        return `${task.total_count}問`;
      case '単語帳':
        return `${task.total_count}語を${task.lap_count}周`;
      case '過去問':
        return `${task.total_count}年分`;
      default:
        return `${task.total_count}ページ`;
    }
  };

  const getTaskStatus = (task: Task) => {
    if (task.growth_stage === -1) {
      return { label: '枯死🍂', color: '#c62828', bgColor: '#ffebee' };
    }
    if (task.growth_stage === 11) {
      return { label: '収穫済🧺', color: '#e65100', bgColor: '#fff3e0' };
    }

    const today = new Date().toISOString().split('T')[0];
    const startDate = task.start_date.split('T')[0];

    if (startDate > today) {
      return { label: '開始前⏳', color: '#1565c0', bgColor: '#e3f2fd' };
    }

    return { label: '進行中🌱', color: '#2e7d32', bgColor: '#e8f5e9' };
  };

  const getTaskTypeColor = (type: string, isWithered: boolean) => {
    if (isWithered) return '#9e9e9e';
    switch (type) {
      case '問題集':
        return '#ff9800'; 
      case '単語帳':
        return '#81c784'; 
      case '過去問':
        return '#ec5e54'; 
      case 'その他':
        return '#46dbe6c9'; 
      default:
        return '#81c784';
    }
  };

  return (
    <Layout>
      <div style={{ width: '100%', padding: '0 2vw', boxSizing: 'border-box' }}>
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
            {tasks.map(task => {
              const status = getTaskStatus(task);
              const isWithered = task.growth_stage === -1;

              return (
                <div 
                  key={task.task_id} 
                  onClick={() => navigate(`/tasks/${task.task_id}`)}
                  style={{
                    border: '1px solid #e0e0e0', 
                    borderRadius: '12px', 
                    padding: '20px', 
                    backgroundColor: isWithered ? '#fafafa' : '#fff', 
                    opacity: isWithered ? 0.75 : 1,
                    boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '20px',
                    cursor: 'pointer', 
                    transition: 'transform 0.2s, box-shadow 0.2s'
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
                  <div style={{ width: '80px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: '#fff', backgroundColor: getTaskTypeColor(task.task_type, isWithered), padding: '4px 10px', borderRadius: '12px', display: 'inline-block', textAlign: 'center' }}>
                      {task.task_type}
                    </span>
                    <span style={{ fontSize: '11px', color: status.color, backgroundColor: status.bgColor, padding: '4px', borderRadius: '8px', display: 'inline-block', textAlign: 'center', fontWeight: 'bold' }}>
                      {status.label}
                    </span>
                  </div>

                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 8px 0', color: isWithered ? '#757575' : '#333', fontSize: '18px' }}>
                      {task.task_title}
                    </h3>
                    <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                      期間: {task.start_date.split('T')[0]} 〜 {task.end_date.split('T')[0]} / {formatTaskCount(task)}
                    </p>
                  </div>
                  
                  <div style={{ 
                    textAlign: 'center', 
                    backgroundColor: isWithered ? '#f5f5f5' : '#f9fbe7', 
                    padding: '12px 20px', 
                    borderRadius: '8px', 
                    minWidth: '100px'
                  }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: isWithered ? '#9e9e9e' : '#558b2f' }}>
                      {task.vegetable_name || '未設定'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Tasks;