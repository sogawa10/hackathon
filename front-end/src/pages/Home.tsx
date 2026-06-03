import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import VegetableField from '../components/VegetableField';
import Layout from '../components/Layout';

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

      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

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
      const notifiedWithered = JSON.parse(localStorage.getItem('notified_withered') || '[]');

      const initialTasks = combinedData.filter((t: TodaySubtask) => {
        if (t && t.growth_stage === -1 && notifiedWithered.includes(t.task_id)) {
          return false; 
        }
        return true;
      });

      setSubtasks(initialTasks);

      const newlyWithered = initialTasks.filter((t: TodaySubtask) => t && t.growth_stage === -1);
      if (newlyWithered.length > 0) {
        const witheredNames = newlyWithered.map((t: TodaySubtask) => t.vegetable_name).join('と');
        setTimeout(() => {
          alert(`残念ですが、${witheredNames}が枯死して消滅しました...🍂\nタスクのスケジュールを見直してみましょう。`);
          const updatedNotified = [...notifiedWithered, ...newlyWithered.map((t: TodaySubtask) => t.task_id)];
          localStorage.setItem('notified_withered', JSON.stringify(updatedNotified));
          setSubtasks(prev => prev.filter(t => t && t.growth_stage !== -1));
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

  if (loading) return <Layout><div>読み込み中…</div></Layout>;
  if (error) return <Layout><div style={{ color: 'red' }}>{error}</div></Layout>;

  const validTasks = subtasks.filter((t): t is TodaySubtask => t !== null && !t.sub_task_id.startsWith('future-'));
  const fieldTasks = subtasks.filter(t => t && t.growth_stage !== 11);

  return (
    <Layout>
      {harvestingTask && (
        <div 
          onClick={handleHarvestSubmit}
          style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.85)', zIndex: 99999,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', animation: 'fadeIn 0.3s ease-out'
          }}
        >
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes popZoom { 0% { transform: scale(0.5); opacity: 0; } 80% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
          `}</style>
          <img 
            src={`/野菜${getVegetableInfoForOverlay(harvestingTask.vegetable_name).size}/収穫_${getVegetableInfoForOverlay(harvestingTask.vegetable_name).jpName}.png`}
            alt={harvestingTask.vegetable_name}
            style={{ width: '280px', height: 'auto', imageRendering: 'pixelated', animation: 'popZoom 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
          />
          <h1 style={{ color: '#fff', fontSize: '32px', marginTop: '30px', textShadow: '0 4px 8px rgba(0,0,0,0.5)', animation: 'popZoom 0.8s ease-out' }}>
            {getVegetableInfoForOverlay(harvestingTask.vegetable_name).jpName}を収穫しました！🎉
          </h1>
          <p style={{ color: '#ccc', marginTop: '15px', fontSize: '16px', animation: 'fadeIn 1s ease-out' }}>
            画面をクリックしてかごにしまう
          </p>
        </div>
      )}

      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          
          <section style={{ flex: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
            <VegetableField 
              subtasks={fieldTasks} 
              systemMessage={systemMessage}
              onClearSystemMessage={() => setSystemMessage(null)}
              onHarvestClick={setHarvestingTask}
            />
          </section>

          <section style={{ flex: 4, padding: '20px', border: '1px solid #e0e0e0', borderRadius: '12px', backgroundColor: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', maxHeight: '500px', overflowY: 'auto' }}>
            <div style={{ borderBottom: '3px solid #4caf50', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: '#333' }}>今日のToDo</h2>
            </div>
            
            {validTasks.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', marginTop: '40px' }}>今日のタスクはありません。</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {validTasks.map((task) => {
                  const isCheckable = task.is_checkable !== false;

                  return (
                    <li key={task.sub_task_id} style={{ display: 'flex', alignItems: 'flex-start', padding: '16px 0', borderBottom: '1px solid #f0f0f0' }}>
                      <input
                        type="checkbox"
                        checked={task.is_completed}
                        disabled={task.is_completed || !isCheckable} 
                        onChange={() => handleToggleComplete(task.sub_task_id, task.is_completed)}
                        style={{ marginRight: '16px', width: '24px', height: '24px', cursor: (task.is_completed || !isCheckable) ? 'not-allowed' : 'pointer', flexShrink: 0, marginTop: '2px', opacity: (task.is_completed || !isCheckable) ? 0.5 : 1 }}
                      />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: '12px', color: '#fff', backgroundColor: '#81c784', padding: '2px 8px', borderRadius: '12px', display: 'inline-block', marginBottom: '6px' }}>{task.task_type}</span>
                        <strong style={{ display: 'block', fontSize: '16px', textDecoration: task.is_completed ? 'line-through' : 'none', color: task.is_completed ? '#aaa' : '#333', marginBottom: '4px' }}>{task.task_title}</strong>
                        <span style={{ fontSize: '14px', color: task.is_completed ? '#aaa' : '#666' }}>{task.task_content}</span>
                        {!isCheckable && !task.is_completed && (
                          <span style={{ fontSize: '12px', color: '#e53935', display: 'block', marginTop: '4px', fontWeight: 'bold' }}>※最終日のみチェック可能</span>
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