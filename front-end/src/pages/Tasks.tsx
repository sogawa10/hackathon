import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 💡 予想されるバックエンドからのレスポンスの型を定義しておく
type Task = {
  task_id: string;
  task_type: string;
  task_title: string;
  total_count: number;
  start_date: string;
  end_date: string;
  vegetable_name: string;
};

// 💡 APIができるまでの「仮のデータ（モック）」
const MOCK_TASKS: Task[] = [
  {
    task_id: "dummy-1",
    task_type: "問題集",
    task_title: "基本情報技術者試験 過去問",
    total_count: 50,
    start_date: "2026-05-01",
    end_date: "2026-05-14",
    vegetable_name: "プチトマト"
  },
  {
    task_id: "dummy-2",
    task_type: "単語帳",
    task_title: "システム英単語",
    total_count: 200,
    start_date: "2026-05-05",
    end_date: "2026-05-20",
    vegetable_name: "キャベツ"
  }
];

const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  useEffect(() => {
    // 💡 本来はここで fetch('/api/tasks') を行いますが、今はモックデータをセットするだけ！
    // API通信の「遅延」を再現するために setTimeout を使うとよりリアルになります
    setTimeout(() => {
      setTasks(MOCK_TASKS);
      setLoading(false);
    }, 500); 
  }, []);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
        <button 
          onClick={() => navigate('/home')}
          style={{
            padding: '8px 16px', backgroundColor: '#e0e0e0', border: 'none', 
            borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'
          }}
        >
          ← ホームへ戻る
        </button>
        <h1 style={{ margin: '0 0 0 20px', color: '#333' }}>📋 タスク一覧</h1>
      </div>

      {loading ? (
        <p>読み込み中...</p>
      ) : tasks.length === 0 ? (
        <p>現在登録されているタスクはありません。</p>
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
              <div>
                <span style={{ fontSize: '12px', color: '#fff', backgroundColor: '#81c784', padding: '4px 10px', borderRadius: '12px', display: 'inline-block', marginBottom: '8px' }}>
                  {task.task_type}
                </span>
                <h3 style={{ margin: '0 0 8px 0', color: '#333' }}>{task.task_title}</h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#666' }}>
                  期間: {task.start_date} 〜 {task.end_date} / 全{task.total_count}単位
                </p>
              </div>
              
              <div style={{ textAlign: 'center', backgroundColor: '#f9fbe7', padding: '10px 20px', borderRadius: '8px' }}>
                <div style={{ fontSize: '24px' }}>🌱</div>
                <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#558b2f' }}>{task.vegetable_name}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Tasks;