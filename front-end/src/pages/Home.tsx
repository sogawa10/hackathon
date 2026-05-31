import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import VegetableField from '../components/VegetableField';
import TaskCreateModal from '../components/TaskCreateModal';

type TodaySubtask = {
  sub_task_id: string;
  scheduled_date: string;
  task_type: string;
  task_title: string;
  task_content: string;
  is_completed: boolean;
  vegetable_name: string;
  growth_stage: number;
};

const Home: React.FC = () => {
  const [subtasks, setSubtasks] = useState<(TodaySubtask | null)[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  
  // ハンバーガーメニューの開閉状態を管理
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  
  const navigate = useNavigate();

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    const fetchTodaySubtasks = async () => {
      try {
        const token = localStorage.getItem('access_token');
        if (!token) {
          throw new Error('認証トークンが見つかりません。再ログインしてください。');
        }

        const res = await fetch(`${API_BASE_URL}/api/subtasks/today`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (res.status === 401) {
          alert('セッションの有効期限が切れました。再度ログインしてください。');
          handleLogout();
          return;
        }

        if (!res.ok) {
          throw new Error('データの取得に失敗しました');
        }

        const data = await res.json();
        setSubtasks(data);
      } catch (err: any) {
        if (err.message.includes('認証トークン')) {
          handleLogout();
        } else {
          setError(err.message || 'エラーが発生しました');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTodaySubtasks();
  }, [API_BASE_URL, navigate]);

  const handleToggleComplete = async (subTaskId: string, currentStatus: boolean) => {
    const isNowCompleted = !currentStatus;

    setSubtasks((prev) =>
      prev.map((task) => {
        if (task && task.sub_task_id === subTaskId) {
          let nextStage = task.growth_stage;
          
          if (isNowCompleted) {
            nextStage = task.growth_stage < 10 ? task.growth_stage + 1 : 10;
          } else {
            nextStage = task.growth_stage > 0 ? task.growth_stage - 1 : 0;
          }

          return {
            ...task,
            is_completed: isNowCompleted,
            growth_stage: nextStage
          };
        }
        return task;
      })
    );
  };

  if (loading) return <div style={{ padding: 20 }}>読み込み中…</div>;
  if (error) return <div style={{ padding: 20, color: 'red' }}>{error}</div>;

  const validTasks = subtasks.filter((t): t is TodaySubtask => t !== null);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
      
      <div style={{ position: 'relative', marginBottom: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button
          onClick={() => navigate('/basket')}
          style={{
            position: 'absolute',
            left: 0,
            padding: '10px 16px',
            backgroundColor: '#ff9800',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            transition: 'background-color 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f57c00'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ff9800'}
        >
          <span>🧺</span> 籠ページへ
        </button>

        <h1 style={{ margin: 0, color: '#333' }}>VegeTASK ホーム</h1>

        {/* ハンバーガーメニュー */}
        <div style={{ position: 'absolute', right: 0 }}>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#333',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ☰
          </button>

          {isMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '8px',
              backgroundColor: '#fff',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              minWidth: '160px',
              zIndex: 100,
              overflow: 'hidden'
            }}>
              <div 
                onClick={() => {
                  setIsMenuOpen(false);
                  navigate('/tasks'); // 💡 アラートを消して、タスク一覧ページへ飛ぶように変更済み！
                }}
                style={{ 
                  padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', 
                  color: '#333', fontSize: '14px', fontWeight: 'bold', transition: 'background-color 0.2s' 
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                📋 タスク一覧
              </div>
              <div 
                onClick={handleLogout}
                style={{ 
                  padding: '12px 16px', cursor: 'pointer', color: '#e53935', 
                  fontSize: '14px', fontWeight: 'bold', transition: 'background-color 0.2s' 
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffebee'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                🚪 ログアウト
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'stretch' }}>
        
        <section style={{ 
          flex: 6, 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px'
        }}>
          <VegetableField subtasks={subtasks} />
        </section>

        <section style={{ 
          flex: 4, 
          padding: '20px', 
          border: '1px solid #e0e0e0', 
          borderRadius: '12px', 
          backgroundColor: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          minHeight: '400px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '3px solid #4caf50', paddingBottom: '10px', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, color: '#333' }}>
              今日のToDo
            </h2>
            <button 
              onClick={() => setIsModalOpen(true)}
              style={{ 
                marginLeft: '15px', width: '32px', height: '32px', borderRadius: '50%', 
                backgroundColor: '#ff9800', color: '#fff', border: 'none', 
                fontSize: '22px', fontWeight: 'bold', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }}
            >
              ＋
            </button>
          </div>
          
          {validTasks.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>今日のタスクはありません。</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {validTasks.map((task) => (
                <li
                  key={task.sub_task_id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: '16px 0',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={task.is_completed}
                    onChange={() => handleToggleComplete(task.sub_task_id, task.is_completed)}
                    style={{ marginRight: '16px', width: '24px', height: '24px', cursor: 'pointer', flexShrink: 0, marginTop: '2px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '12px', color: '#fff', backgroundColor: '#81c784', padding: '2px 8px', borderRadius: '12px', display: 'inline-block', marginBottom: '6px' }}>
                      {task.task_type}
                    </span>
                    <strong style={{ 
                      display: 'block',
                      fontSize: '16px',
                      textDecoration: task.is_completed ? 'line-through' : 'none', 
                      color: task.is_completed ? '#aaa' : '#333',
                      marginBottom: '4px'
                    }}>
                      {task.task_title}
                    </strong>
                    <span style={{ fontSize: '14px', color: task.is_completed ? '#aaa' : '#666' }}>
                      {task.task_content}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
      
      <TaskCreateModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onTaskCreated={() => setIsModalOpen(false)}
      />
    </div>
  );
};

export default Home;