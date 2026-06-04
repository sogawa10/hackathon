import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import VegetableField from '../components/VegetableField';
import Layout from '../components/Layout';
import './Home.css';

type TodaySubtask = {
  sub_task_id: string;
  task_id: string;
  scheduled_date: string;
  task_type: string;
  task_title: string;
  task_content: string;
  is_completed: boolean;
  vegetable_name: string;
  growth_stage: number;
  is_checkable?: boolean;
};

const Home: React.FC = () => {
  const [subtasks, setSubtasks] = useState<(TodaySubtask | null)[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [systemMessage, setSystemMessage] = useState<string | null>(null);
  const [harvestingTask, setHarvestingTask] = useState<TodaySubtask | null>(null);
  const [witheredTasks, setWitheredTasks] = useState<TodaySubtask[]>([]);
  
  const location = useLocation();
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

  useEffect(() => {
    const state = location.state as { systemMessage?: string } | null;
    if (state?.systemMessage) {
      setSystemMessage(state.systemMessage);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  const fetchTodaySubtasks = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) throw new Error('認証トークンが見つかりません');

      const [resToday, resTasks] = await Promise.all([
        fetch(`${API_BASE_URL}/api/subtasks/today`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }),
        fetch(`${API_BASE_URL}/api/tasks`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
      ]);

      if (!resToday.ok) throw new Error('データの取得に失敗しました');

      const todayData = await resToday.json();
      const safeTodayData = Array.isArray(todayData) ? todayData : [];
      
      const allTasksData = resTasks.ok ? await resTasks.json() : [];
      const safeAllTasks = Array.isArray(allTasksData) ? allTasksData : [];

      // 現在時刻の取得
      const mockDate = import.meta.env.VITE_MOCK_TODAY;
      let todayStr = '';
      if (mockDate) {
        todayStr = mockDate;
      } else {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        todayStr = `${year}-${month}-${day}`;
      }

      const futureTasks = safeAllTasks.filter((t: any) => {
        if (!t.start_date) return false;
        const startDateStr = t.start_date.split('T')[0];
        return startDateStr > todayStr && Number(t.growth_stage) === 0;
      });

      const futureMockSubtasks: TodaySubtask[] = futureTasks.map((t: any) => ({
        sub_task_id: `future-${t.task_id}`,
        task_id: t.task_id,
        scheduled_date: t.start_date,
        task_type: t.task_type,
        task_title: t.task_title,
        task_content: '開始日までお待ちください',
        is_completed: false,
        vegetable_name: t.vegetable_name || 'かぼちゃ',
        growth_stage: 0,
        is_checkable: false,
      }));

      const combinedData = [...safeTodayData, ...futureMockSubtasks];

      const storedNotified = localStorage.getItem('notified_withered');
      let notifiedWithered: string[] = [];
      
      if (storedNotified) {
        notifiedWithered = JSON.parse(storedNotified);
      } else {
        const allWitheredIds = safeAllTasks
          .filter((t: any) => t.growth_stage === -1)
          .map((t: any) => t.task_id);
        localStorage.setItem('notified_withered', JSON.stringify(allWitheredIds));
        notifiedWithered = allWitheredIds;
      }

      const initialTasks = combinedData.filter((t: TodaySubtask) => {
        if (t && t.growth_stage === -1 && notifiedWithered.includes(t.task_id)) {
          return false; 
        }
        return true;
      });

      setSubtasks(initialTasks);

      const newlyWitheredTasks = safeAllTasks.filter((t: any) => t.growth_stage === -1 && !notifiedWithered.includes(t.task_id));
      if (newlyWitheredTasks.length > 0) {
        const mappedWithered: TodaySubtask[] = newlyWitheredTasks.map((t: any) => ({
          sub_task_id: `withered-${t.task_id}`,
          task_id: t.task_id,
          scheduled_date: t.start_date || '',
          task_type: t.task_type,
          task_title: t.task_title,
          task_content: '',
          is_completed: false,
          vegetable_name: t.vegetable_name || '野菜',
          growth_stage: -1,
        }));
        setTimeout(() => {
          setWitheredTasks(mappedWithered);
        }, 1200); 
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodaySubtasks(true);
  }, [API_BASE_URL]);

  useEffect(() => {
    const handleTaskCreated = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setSystemMessage(customEvent.detail);
      }
      fetchTodaySubtasks(false);
    };
    window.addEventListener('taskCreated', handleTaskCreated);
    return () => window.removeEventListener('taskCreated', handleTaskCreated);
  }, []);

  const handleToggleComplete = async (subTaskId: string, currentStatus: boolean) => {
    if (currentStatus) return;

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/api/subtasks`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sub_task_id: subTaskId }),
      });

      if (!res.ok) throw new Error('タスクの完了に失敗しました');

      const data = await res.json();
      let updatedGrowthStage: number | undefined = undefined;
      
      const parseGrowthStage = (obj: any) => {
        if (!obj) return undefined;
        if (typeof obj.growth_stage === 'number') return obj.growth_stage;
        if (typeof obj.growth_stage === 'string') return parseInt(obj.growth_stage, 10);
        if (typeof obj.GrowthStage === 'number') return obj.GrowthStage;
        if (typeof obj.GrowthStage === 'string') return parseInt(obj.GrowthStage, 10);
        return undefined;
      };

      if (Array.isArray(data) && data.length > 0) {
        updatedGrowthStage = parseGrowthStage(data[0]);
      } else {
        updatedGrowthStage = parseGrowthStage(data);
      }

      setSubtasks((prev) =>
        prev.map((task) => {
          if (task && task.sub_task_id === subTaskId) {
            return {
              ...task,
              is_completed: true,
              growth_stage: updatedGrowthStage !== undefined && !isNaN(updatedGrowthStage) ? updatedGrowthStage : task.growth_stage
            };
          }
          return task;
        })
      );
    } catch (err: any) {
      console.error(err);
      alert('エラーが発生しました');
    }
  };

  const getVegetableInfoForOverlay = (vegName: string) => {
    let size = 'L';
    let jpName = 'かぼちゃ';
    if (['かぼちゃ', 'kabocha', 'pumpkin', 'L'].includes(vegName)) { jpName = 'かぼちゃ'; size = 'L'; }
    else if (['キャベツ', 'cabbage'].includes(vegName)) { jpName = 'キャベツ'; size = 'L'; }
    else if (['トウモロコシ', 'corn'].includes(vegName)) { jpName = 'トウモロコシ'; size = 'L'; }
    else if (['ブロッコリー', 'broccoli'].includes(vegName)) { jpName = 'ブロッコリー'; size = 'L'; }
    else if (['カリフラワー', 'cauliflower'].includes(vegName)) { jpName = 'カリフラワー'; size = 'L'; }
    else if (['赤パプリカ', 'ピーマン', 'なす', 'キュウリ', 'タケノコ', 'M'].includes(vegName)) { jpName = vegName === 'M' ? 'なす' : vegName; size = 'M'; }
    else if (['プチトマト', 'オクラ', '枝豆', 'シイタケ', 'ネギ', 'S'].includes(vegName)) { jpName = vegName === 'S' ? 'プチトマト' : vegName; size = 'S'; }
    return { size, jpName };
  };

  const handleHarvestSubmit = async () => {
    if (!harvestingTask) return;
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/api/tasks/harvest`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ task_id: harvestingTask.task_id }),
      });

      if (!res.ok) throw new Error('収穫に失敗しました');

      setSubtasks((prev) =>
        prev.map((task) =>
          task && task.sub_task_id === harvestingTask.sub_task_id
            ? { ...task, growth_stage: 11 }
            : task
        )
      );
    } catch (err: any) {
      console.error(err);
      alert('収穫通信エラーが発生しました。');
    }
    setHarvestingTask(null);
  };

  const handleCloseWitheredPopup = () => {
    const notifiedWithered = JSON.parse(localStorage.getItem('notified_withered') || '[]');
    const updatedNotified = [...notifiedWithered, ...witheredTasks.map(t => t.task_id)];
    localStorage.setItem('notified_withered', JSON.stringify(updatedNotified));
    setSubtasks(prev => prev.filter(t => t && t.growth_stage !== -1));
    setWitheredTasks([]);
  };

  if (loading) return <Layout><div>読み込み中…</div></Layout>;
  if (error) return <Layout><div style={{ color: 'red' }}>{error}</div></Layout>;

  const validTasks = subtasks.filter((t): t is TodaySubtask => t !== null && !t.sub_task_id.startsWith('future-'));
  const fieldTasks = subtasks.filter(t => t && t.growth_stage !== 11);

  return (
    <Layout>
      {harvestingTask && (
        <div className="harvest-overlay" onClick={handleHarvestSubmit}>
          <img 
            className="harvest-image"
            src={`/野菜${getVegetableInfoForOverlay(harvestingTask.vegetable_name).size}/収穫_${getVegetableInfoForOverlay(harvestingTask.vegetable_name).jpName}.png`}
            alt={harvestingTask.vegetable_name}
          />
          <h1 className="harvest-title">
            {getVegetableInfoForOverlay(harvestingTask.vegetable_name).jpName}を収穫しました！🎉
          </h1>
          <p className="harvest-subtitle">
            画面をクリックしてかごにしまう
          </p>
        </div>
      )}

      {witheredTasks.length > 0 && (
        <div className="harvest-overlay" onClick={handleCloseWitheredPopup}>
          <div style={{ fontSize: '120px', marginBottom: '40px', animation: 'popOutImage 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}>
            🍂
          </div>
          <h1 className="harvest-title" style={{ textAlign: 'center', lineHeight: '1.4' }}>
            残念ですが、<br />
            <span style={{ color: '#ff5252' }}>{witheredTasks.map(t => t.vegetable_name || '野菜').join('と')}</span>
            <br />が枯死して消滅しました...
          </h1>
          <p className="harvest-subtitle" style={{ marginTop: '20px' }}>
            タスクのスケジュールを見直してみましょう<br />
            （画面をクリックして閉じる）
          </p>
        </div>
      )}

      <div className="home-container">
        <div className="home-layout">
          
          <section className="home-field-section">
            <VegetableField 
              subtasks={fieldTasks} 
              systemMessage={systemMessage}
              onClearSystemMessage={() => setSystemMessage(null)}
              onHarvestClick={setHarvestingTask}
            />
          </section>

          <section className="todo-section">
            <div className="todo-header">
              <h2>今日のToDo</h2>
            </div>
            
            {validTasks.length === 0 ? (
              <p className="todo-empty">今日のタスクはありません。</p>
            ) : (
              <ul className="todo-list">
                {validTasks.map((task) => {
                  const isCheckable = task.is_checkable !== false;
                  const titleClass = task.is_completed ? "todo-title completed" : "todo-title";
                  const contentClass = task.is_completed ? "todo-content completed" : "todo-content";

                  return (
                    <li key={task.sub_task_id} className={`todo-item ${task.is_completed ? 'completed-row' : ''}`}>
                      <input
                        type="checkbox"
                        checked={task.is_completed}
                        disabled={task.is_completed || !isCheckable} 
                        onChange={() => handleToggleComplete(task.sub_task_id, task.is_completed)}
                        className="todo-checkbox"
                      />
                      <div className="todo-details">
                        <span className="todo-badge">{task.task_type}</span>
                        <strong className={titleClass}>{task.task_title}</strong>
                        <span className={contentClass}>{task.task_content}</span>
                        {!isCheckable && !task.is_completed && (
                          <span className="todo-warning">※最終日のみチェック可能</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default Home;