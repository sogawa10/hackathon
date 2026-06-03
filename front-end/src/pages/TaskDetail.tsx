import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';

type TaskDetail = {
  task_id: string;
  task_type: string;
  task_title: string;
  total_count: number;
  lap_count: number;
  start_date: string;
  end_date: string;
  buffer_days: number;
  vegetable_name: string;
  growth_stage: number;
};

const TaskDetail: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

  useEffect(() => {
    const fetchTaskDetail = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch(`${API_BASE_URL}/api/tasks`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data: TaskDetail[] = await res.json();
        const found = data.find(t => t.task_id === taskId);
        if (found) {
          setTask(found);
        } else {
          setError('タスクが見つかりませんでした');
        }
      } catch {
        setError('データの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };
    fetchTaskDetail();
  }, [taskId, API_BASE_URL]);

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        navigate('/tasks');
      } else {
        alert('削除に失敗しました');
      }
    } catch {
      alert('エラーが発生しました');
    }
  };

  const getUnit = (type: string) => {
    switch (type) {
      case '問題集': return '問';
      case '単語帳': return '語';
      case '過去問': return '年分';
      default: return '単位';
    }
  };

  const getGrowthStatusLabel = (stage: number) => {
    if (stage === -1) return '枯死';
    if (stage === 0) return '種';
    if (stage >= 1 && stage <= 9) return `LV-${stage}`;
    if (stage === 10) return '収穫可能';
    if (stage === 11) return '収穫済み';
    return '不明';
  };

  if (loading) return <Layout><div>読み込み中...</div></Layout>;
  if (error || !task) return <Layout><div>{error}</div></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px' }}>
        <button 
          onClick={() => navigate('/tasks')} 
          style={{ 
            marginBottom: '20px', padding: '10px 20px', borderRadius: '20px', 
            border: 'none', backgroundColor: '#ff9800', color: '#fff', 
            fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' 
          }}
        >
          一覧に戻る
        </button>
        
        <div style={{ backgroundColor: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#333' }}>{task.task_title}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '16px', color: '#555' }}>
            <p><strong>種類:</strong> {task.task_type}</p>
            <p><strong>分量:</strong> {task.total_count} {getUnit(task.task_type)}</p>
            {task.task_type === '単語帳' && <p><strong>周回数:</strong> {task.lap_count} 周</p>}
            <p><strong>期間:</strong> {task.start_date} 〜 {task.end_date}</p>
            <p><strong>残りの予備日:</strong> {task.buffer_days} 日</p>
            <p><strong>野菜:</strong> {task.vegetable_name || '未設定'}</p>
            <p><strong>状態:</strong> {getGrowthStatusLabel(task.growth_stage)}</p>
          </div>

          <div style={{ marginTop: '30px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
            {!isDeleting ? (
              <button 
                onClick={() => setIsDeleting(true)}
                style={{ backgroundColor: '#ff5252', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer' }}
              >
                このタスクを削除する
              </button>
            ) : (
              <div style={{ padding: '15px', backgroundColor: '#fff0f0', borderRadius: '8px', border: '1px solid #ffcdd2' }}>
                <p style={{ margin: '0 0 10px 0', color: '#d32f2f', fontWeight: 'bold', textAlign: 'center' }}>本当に削除しますか？</p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button onClick={handleDelete} style={{ backgroundColor: '#d32f2f', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>確定</button>
                  <button onClick={() => setIsDeleting(false)} style={{ backgroundColor: '#ccc', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>キャンセル</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default TaskDetail;