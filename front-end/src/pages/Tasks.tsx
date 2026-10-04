import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { cropImagePath, TASK_TYPE_CLASS } from '../vegetables';
import './Tasks.css';

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

  const todayStr = (() => {
    const mockDate = import.meta.env.VITE_MOCK_TODAY;
    if (mockDate) return mockDate;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const getTaskStatus = (task: Task) => {
    if (task.growth_stage === -1) return { label: '枯れた', className: 'is-withered' };
    if (task.growth_stage === 11) return { label: '収穫済み', className: 'is-harvested' };
    if (task.growth_stage === 10) return { label: '収穫できる', className: 'is-ripe' };
    if (task.start_date.split('T')[0] > todayStr) return { label: '開始前', className: 'is-waiting' };
    return { label: '育成中', className: 'is-growing' };
  };

  const toDay = (dateStr: string) => Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10)),
  ) / 86400000;

  const formatMonthDay = (dateStr: string) => `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}`;

  const getCalendar = (task: Task) => {
    const start = task.start_date.split('T')[0];
    const end = task.end_date.split('T')[0];
    const span = Math.max(1, toDay(end) - toDay(start) + 1);
    const elapsed = toDay(todayStr) - toDay(start) + 1;
    const ratio = Math.min(1, Math.max(0, elapsed / span));
    const showToday = elapsed >= 1 && elapsed <= span;
    return { start, end, ratio, showToday };
  };

  const growthPips = (stage: number) => {
    const filled = stage >= 10 ? 10 : Math.max(0, stage);
    return Array.from({ length: 10 }, (_, i) => i < filled);
  };

  return (
    <Layout>
      <div className="tasks-page">
        <h1 className="page-title">タスク一覧</h1>

        {loading ? (
          <p className="status-line">タスクを読み込んでいます…</p>
        ) : error ? (
          <p className="status-line is-error">{error}</p>
        ) : tasks.length === 0 ? (
          <div className="tasks-empty">
            <p><strong>まだ何も植えていません</strong></p>
            <p>上の「＋ 新規タスク」から教材と期間を登録すると、種袋がここに並びます。</p>
          </div>
        ) : (
          <ul className="packet-shelf">
            {tasks.map(task => {
              const status = getTaskStatus(task);
              const calendar = getCalendar(task);
              const image = cropImagePath(task.vegetable_name, task.growth_stage);
              const stageForPips = task.growth_stage === 11 ? 10 : task.growth_stage;

              return (
                <li key={task.task_id}>
                  <Link
                    to={`/tasks/${task.task_id}`}
                    className={`packet ${TASK_TYPE_CLASS[task.task_type] ?? 'type-other'} ${status.className}`}
                  >
                    <div className="packet-band">
                      <span>{task.task_type}</span>
                      <span className="packet-status">{status.label}</span>
                    </div>

                    <div className="packet-face">
                      <span className="packet-veg" style={{ '--chars': (task.vegetable_name || '未設定').length } as React.CSSProperties}>{task.vegetable_name || '未設定'}</span>
                      {image && <img src={image} alt="" className="packet-image" draggable={false} />}
                    </div>

                    <div className="packet-back">
                      <h2 className="packet-title">{task.task_title}</h2>
                      <p className="packet-amount">{formatTaskCount(task)}</p>

                      {task.growth_stage !== -1 && (
                        <div className="packet-growth" aria-label={`成長 ${Math.max(0, stageForPips)} / 10`}>
                          {growthPips(stageForPips).map((on, i) => (
                            <span key={i} className={on ? 'pip on' : 'pip'} />
                          ))}
                        </div>
                      )}

                      <div className="packet-calendar" aria-label={`期間 ${calendar.start} から ${calendar.end}`}>
                        <div className="packet-calendar-track">
                          <div className="packet-calendar-fill" style={{ width: `${calendar.ratio * 100}%` }} />
                          {calendar.showToday && (
                            <span className="packet-calendar-today" style={{ left: `${calendar.ratio * 100}%` }} />
                          )}
                        </div>
                        <div className="packet-calendar-dates">
                          <span>{formatMonthDay(calendar.start)}</span>
                          <span>{formatMonthDay(calendar.end)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Layout>
  );
};

export default Tasks;
