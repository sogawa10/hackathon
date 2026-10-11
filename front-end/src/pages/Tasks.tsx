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
  buffer_days: number;
  start_date: string;
  end_date: string;
  vegetable_name: string;
  growth_stage: number;
};

const TASK_TYPES = ['問題集', '単語帳', '過去問', 'その他'];
const SORT_OPTIONS = [
  { value: 'start-asc', label: '開始日の早い順' },
  { value: 'start-desc', label: '開始日の遅い順' },
  { value: 'end-asc', label: '期日の早い順' },
  { value: 'end-desc', label: '期日の遅い順' },
  { value: 'buffer-desc', label: '予備日の多い順' },
  { value: 'buffer-asc', label: '予備日の少ない順' },
  { value: 'amount-desc', label: '分量の多い順（教材別）' },
  { value: 'amount-asc', label: '分量の少ない順（教材別）' },
];
const STATUS_OPTIONS = [
  { value: 'all', label: 'すべて' },
  { value: 'is-waiting', label: '開始前' },
  { value: 'is-growing', label: '育成中' },
  { value: 'is-ripe', label: '収穫できる' },
  { value: 'is-harvested', label: '収穫済み' },
  { value: 'is-withered', label: '枯れた' },
];

const Tasks: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState('start-desc');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
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
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'エラーが発生しました');
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

  const normalizeSearch = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ja-JP');
  const searchTerm = normalizeSearch(search.trim());
  const taskAmount = (task: Task) => task.total_count * (task.task_type === '単語帳' ? task.lap_count : 1);
  const visibleTasks = tasks.filter(task =>
    (statusFilter === 'all' || getTaskStatus(task).className === statusFilter) &&
    (typeFilter === 'all' || task.task_type === typeFilter) &&
    normalizeSearch(task.task_title).includes(searchTerm)
  ).sort((a, b) => {
    const direction = sortOrder.endsWith('-asc') ? 1 : -1;
    if (sortOrder.startsWith('amount-')) {
      const typeDifference = TASK_TYPES.indexOf(a.task_type) - TASK_TYPES.indexOf(b.task_type);
      if (typeDifference !== 0) return typeDifference;
      return direction * (taskAmount(a) - taskAmount(b));
    }
    if (sortOrder.startsWith('buffer-')) return direction * (a.buffer_days - b.buffer_days);
    const dateA = sortOrder.startsWith('start-') ? a.start_date : a.end_date;
    const dateB = sortOrder.startsWith('start-') ? b.start_date : b.end_date;
    return direction * dateA.split('T')[0].localeCompare(dateB.split('T')[0]);
  });
  const resetFilters = () => {
    setStatusFilter('all');
    setTypeFilter('all');
    setSearch('');
  };
  const hasFilters = statusFilter !== 'all' || typeFilter !== 'all' || search !== '';

  return (
    <Layout>
      <div className="tasks-page">
        <h1 className="page-title">タスク一覧</h1>

        {!loading && !error && tasks.length > 0 && (
          <section className="tasks-controls" aria-label="タスクの検索・絞り込み・並べ替え">
            <div className="tasks-control-grid">
              <label className="tasks-control">
                <span>タスク名で検索</span>
                <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="タスク名を入力" />
              </label>
              <label className="tasks-control">
                <span>並べ替え</span>
                <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                  {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <fieldset className="tasks-filter-group">
              <legend>育成段階</legend>
              <div className="tasks-filter-buttons">
                {STATUS_OPTIONS.map(option => (
                  <button key={option.value} type="button" aria-pressed={statusFilter === option.value}
                    className={`tasks-filter-button ${option.value}`} onClick={() => setStatusFilter(option.value)}>
                    <span className="tasks-filter-check" aria-hidden="true">{statusFilter === option.value ? '✓' : ''}</span>{option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="tasks-filter-group">
              <legend>教材の種類</legend>
              <div className="tasks-filter-buttons">
                {['all', ...TASK_TYPES].map(type => (
                  <button key={type} type="button" aria-pressed={typeFilter === type}
                    className={`tasks-filter-button ${TASK_TYPE_CLASS[type] ?? ''}`} onClick={() => setTypeFilter(type)}>
                    <span className="tasks-filter-check" aria-hidden="true">{typeFilter === type ? '✓' : ''}</span>{type === 'all' ? 'すべて' : type}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="tasks-control-summary">
              <p role="status"><strong>{visibleTasks.length}</strong> / {tasks.length} 件のタスクを表示</p>
              <button type="button" className="btn btn-quiet" disabled={!hasFilters} onClick={resetFilters}>絞り込みを解除</button>
            </div>
            {sortOrder.startsWith('amount-') && (
              <p className="tasks-sort-note">問題集 → 単語帳 → 過去問 → その他の順にまとめ、教材ごとに分量で並べ替えます。単語帳は単語数 × 周回数で比較します。</p>
            )}
          </section>
        )}

        {loading ? (
          <p className="status-line">タスクを読み込んでいます…</p>
        ) : error ? (
          <p className="status-line is-error">{error}</p>
        ) : tasks.length === 0 ? (
          <div className="tasks-empty">
            <p><strong>まだ何も植えていません</strong></p>
            <p>上の「＋ 新規タスク」から教材と期間を登録すると、種袋がここに並びます。</p>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="tasks-empty">
            <p><strong>条件に一致するタスクがありません</strong></p>
            <p>検索するタスク名や絞り込み条件を変更してください。</p>
          </div>
        ) : (
          <ul className="packet-shelf">
            {visibleTasks.map(task => {
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
                      <p className="packet-amount">残りの予備日 {task.buffer_days} 日</p>

                      {task.growth_stage !== -1 && (
                        <div className="packet-growth-section">
                          <p className="packet-meter-label">野菜の成長度 <span>{Math.max(0, stageForPips)} / 10</span></p>
                          <div className="packet-growth" aria-hidden="true">
                          {growthPips(stageForPips).map((on, i) => (
                            <span key={i} className={on ? 'pip on' : 'pip'} />
                          ))}
                          </div>
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
