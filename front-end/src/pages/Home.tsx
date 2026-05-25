import React, { useEffect, useState } from 'react';

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
  const [subtasks, setSubtasks] = useState<TodaySubtask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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

        if (!res.ok) {
          throw new Error('データの取得に失敗しました');
        }

        const data = await res.json();
        setSubtasks(Array.isArray(data) ? data : []);
      } catch (err: any) {
        setError(err.message || 'エラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchTodaySubtasks();
  }, []);

  const handleToggleComplete = async (subTaskId: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/api/subtasks`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ sub_task_id: subTaskId }]),
      });

      if (!res.ok) {
        throw new Error('タスクの更新に失敗しました');
      }

      setSubtasks((prev) =>
        prev.map((task) =>
          task.sub_task_id === subTaskId ? { ...task, is_completed: !currentStatus } : task
        )
      );
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>読み込み中…</div>;
  if (error) return <div style={{ padding: 20, color: 'red' }}>{error}</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px', color: '#333' }}>VegeTASK ホーム</h1>

      {/* コンテナをFlexboxにして横並びに配置 */}
      <div style={{ display: 'flex', gap: '24px', alignItems: 'stretch' }}>
        
        {/* 左側：畑の画面 (6割) */}
        <section style={{ 
          flex: 6, 
          padding: '30px', 
          border: '2px solid #81c784', 
          borderRadius: '12px', 
          backgroundColor: '#e8f5e9',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px'
        }}>
          {subtasks.length > 0 ? (
            <div style={{ textAlign: 'center', width: '100%' }}>
              <div style={{ fontSize: '80px', marginBottom: '20px' }}>🌱</div>
              <h2 style={{ margin: '0 0 10px 0', color: '#2e7d32' }}>{subtasks[0].vegetable_name} を栽培中</h2>
              <p style={{ fontSize: '18px', color: '#555', marginBottom: '20px' }}>
                成長段階: <strong>{subtasks[0].growth_stage}</strong> / 9
              </p>
              
              {/* プログレスバー */}
              <div style={{ width: '80%', margin: '0 auto', backgroundColor: '#c8e6c9', borderRadius: '8px', height: '20px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${(subtasks[0].growth_stage / 9) * 100}%`, 
                  backgroundColor: '#4caf50', 
                  height: '100%', 
                  transition: 'width 0.3s ease-in-out' 
                }} />
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#757575' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>🪹</div>
              <p style={{ fontSize: '18px', fontWeight: 'bold' }}>現在植えられている種はありません</p>
              <p>タスクを作成して、新しい野菜を育て始めましょう！</p>
            </div>
          )}
        </section>

        {/* 右側：今日のタスク (4割) */}
        <section style={{ 
          flex: 4, 
          padding: '20px', 
          border: '1px solid #e0e0e0', 
          borderRadius: '12px', 
          backgroundColor: '#fff',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          minHeight: '400px'
        }}>
          <h2 style={{ marginTop: 0, borderBottom: '3px solid #4caf50', paddingBottom: '10px', color: '#333' }}>
            今日のToDo
          </h2>
          
          {subtasks.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>今日のタスクはありません。</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {subtasks.map((task) => (
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
    </div>
  );
};

export default Home;