import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { cropImagePath, TASK_TYPE_CLASS } from '../vegetables';
import './Tasks.css';
import './TaskDetail.css';

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
    if (stage === -1) return '枯れた';
    if (stage === 0) return '種';
    if (stage >= 1 && stage <= 9) return `成長 ${stage} / 10`;
    if (stage === 10) return '収穫できる';
    if (stage === 11) return '収穫済み';
    return '不明';
  };

  if (loading) return <Layout><p className="status-line">タスクを読み込んでいます…</p></Layout>;
  if (error || !task) return <Layout><p className="status-line is-error">{error}</p></Layout>;

  const image = cropImagePath(task.vegetable_name, task.growth_stage);
  const typeClass = TASK_TYPE_CLASS[task.task_type] ?? 'type-other';
  const stateClass = task.growth_stage === -1 ? 'is-withered' : task.growth_stage === 10 ? 'is-ripe' : '';

  return (
    <Layout>
      <div className="detail-page">
        <Link to="/tasks" className="detail-back">タスク一覧に戻る</Link>

        <article className={`detail packet ${typeClass} ${stateClass}`}>
          <div className="packet-band">
            <span>{task.task_type}</span>
            <span className="packet-status">{getGrowthStatusLabel(task.growth_stage)}</span>
          </div>

          <div className="detail-body">
            <div className="packet-face detail-face">
              <span className="packet-veg" style={{ '--chars': (task.vegetable_name || '未設定').length } as React.CSSProperties}>{task.vegetable_name || '未設定'}</span>
              {image && <img src={image} alt="" className="packet-image" draggable={false} />}
            </div>

            <div className="detail-info">
              <h1 className="detail-title">{task.task_title}</h1>
              <dl className="detail-list">
                <div>
                  <dt>分量</dt>
                  <dd>{task.total_count} {getUnit(task.task_type)}</dd>
                </div>
                {task.task_type === '単語帳' && (
                  <div>
                    <dt>周回数</dt>
                    <dd>{task.lap_count} 周</dd>
                  </div>
                )}
                <div>
                  <dt>期間</dt>
                  <dd>{task.start_date.split('T')[0]} 〜 {task.end_date.split('T')[0]}</dd>
                </div>
                <div>
                  <dt>残りの予備日</dt>
                  <dd>{task.buffer_days} 日</dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="detail-danger">
            {!isDeleting ? (
              <button type="button" className="btn btn-quiet detail-delete" onClick={() => setIsDeleting(true)}>
                このタスクを削除
              </button>
            ) : (
              <div className="detail-confirm" role="alert">
                <p>削除すると、畑の野菜と毎日のToDoも消えます。元に戻せません。</p>
                <div className="detail-confirm-actions">
                  <button type="button" className="btn btn-quiet" onClick={() => setIsDeleting(false)}>キャンセル</button>
                  <button type="button" className="btn btn-danger" onClick={handleDelete}>削除する</button>
                </div>
              </div>
            )}
          </div>
        </article>
      </div>
    </Layout>
  );
};

export default TaskDetail;
