import React, { useEffect, useRef, useState } from 'react';

interface TodaySubtask {
  sub_task_id: string;
  scheduled_date: string;
  task_type: string;
  task_title: string;
  task_content: string;
  is_completed: boolean;
  vegetable_name: string;
  growth_stage: number;
  is_checkable?: boolean;
}

interface VegetableFieldProps {
  subtasks: (TodaySubtask | null)[];
  systemMessage?: string | null;
  onClearSystemMessage?: () => void;
}

const PLACEMENT_ORDER: number[] = [
  12, 8, 16, 4, 20, 18, 14, 22, 24, 6, 2, 10, 0, 13, 17, 9, 21, 19, 23, 7, 11, 3, 15, 1, 5
];

const GRID_POSITIONS: { [key: number]: { top: string; left: string } } = {
  0:  { top: '28%', left: '50.5%' },
  1:  { top: '33.5%', left: '41%' },
  2:  { top: '38.5%', left: '31.5%' },
  3:  { top: '44%', left: '22%' },
  4:  { top: '49.25%', left: '12.5%' },
  5:  { top: '34.25%', left: '60%' },
  6:  { top: '39%', left: '50.5%' },
  7:  { top: '44%', left: '41%' },
  8:  { top: '49.75%', left: '31.5%' },
  9:  { top: '54.5%', left: '22%' },
  10: { top: '38.5%', left: '69.5%' },
  11: { top: '44.75%', left: '60%' },
  12: { top: '49.5%', left: '50.5%' },
  13: { top: '54.5%', left: '41%' },
  14: { top: '60%', left: '31.5%' },
  15: { top: '44.25%', left: '79%' },
  16: { top: '49.5%', left: '69.5%' },
  17: { top: '55.5%', left: '60%' },
  18: { top: '60.25%', left: '50.5%' },
  19: { top: '65.25%', left: '41%' },
  20: { top: '49.5%', left: '88.5%' },
  21: { top: '55%', left: '79%' },
  22: { top: '60.25%', left: '69.5%' },
  23: { top: '66.5%', left: '60%' },
  24: { top: '71%', left: '50.5%' }
};

const ASSET_SCALE = 0.2;

const VegetableField: React.FC<VegetableFieldProps> = ({ subtasks = [], systemMessage, onClearSystemMessage }) => {
  const field: (TodaySubtask | null)[] = Array(25).fill(null);
  
  const [recentCompleted, setRecentCompleted] = useState<Set<string>>(new Set());
  const [growthMsgs, setGrowthMsgs] = useState<{ [subTaskId: string]: string }>({});
  const [isClearingSystemMessage, setIsClearingSystemMessage] = useState(false);

  const prevSubtasksRef = useRef<(TodaySubtask | null)[]>([]);

  useEffect(() => {
    const newGrowthMsgs = { ...growthMsgs };
    let hasNewGrowth = false;

    subtasks.forEach(task => {
      if (!task) return;
      
      const prevTask = prevSubtasksRef.current.find(t => t && t.sub_task_id === task.sub_task_id);
      
      if (prevTask && !prevTask.is_completed && task.is_completed) {
        setRecentCompleted(prev => {
          const next = new Set(prev);
          next.add(task.sub_task_id);
          return next;
        });

        setTimeout(() => {
          setRecentCompleted(prev => {
            const next = new Set(prev);
            next.delete(task.sub_task_id);
            return next;
          });
        }, 1000);

        if (prevTask.growth_stage < task.growth_stage && task.growth_stage > 0) {
          newGrowthMsgs[task.sub_task_id] = `${task.vegetable_name || '野菜'}が一段階成長しました！✨`;
        } else {
          newGrowthMsgs[task.sub_task_id] = `${task.vegetable_name || '野菜'}に栄養が届きました！💧`;
        }
        hasNewGrowth = true;

        setTimeout(() => {
          setGrowthMsgs(prev => {
            const next = { ...prev };
            delete next[task.sub_task_id];
            return next;
          });
        }, 3000);
      }
    });

    if (hasNewGrowth) {
      setGrowthMsgs(newGrowthMsgs);
    }

    prevSubtasksRef.current = subtasks;
  }, [subtasks]);

  useEffect(() => {
    if (systemMessage) setIsClearingSystemMessage(false);
  }, [systemMessage]);

  if (Array.isArray(subtasks)) {
    const unassignedTasks: TodaySubtask[] = [];
    
    subtasks.forEach((task, index) => {
      if (!task) return;
      
      if (subtasks.length === 25) {
        if (task) {
          field[index] = task;
        }
      } else {
        unassignedTasks.push(task);
      }
    });

    if (subtasks.length !== 25) {
      unassignedTasks.forEach((task) => {
        const availableSlot = PLACEMENT_ORDER.find(gridIndex => field[gridIndex] === null);
        
        if (availableSlot !== undefined) {
          field[availableSlot] = task;
        }
      });
    }
  }

  const getVegetableInfo = (task: TodaySubtask) => {
    let vegName = task.vegetable_name || 'kabocha';
    let size = 'L';
    let jpName = 'かぼちゃ';

    if (vegName === 'kabocha' || vegName === 'pumpkin' || vegName === 'L') {
      jpName = 'かぼちゃ';
      size = 'L';
    } else if (vegName === 'cabbage') {
      jpName = 'キャベツ';
      size = 'L';
    } else if (vegName === 'corn') {
      jpName = 'トウモロコシ';
      size = 'L';
    } else if (vegName === 'broccoli') {
      jpName = 'ブロッコリー';
      size = 'L';
    } else if (vegName === 'cauliflower') {
      jpName = 'カリフラワー';
      size = 'L';
    } else if (['赤パプリカ', 'ピーマン', 'なす', 'キュウリ', 'タケノコ', 'M'].includes(vegName)) {
      jpName = vegName === 'M' ? 'なす' : vegName;
      size = 'M';
    } else if (['プチトマト', 'オクラ', '枝豆', 'シイタケ', 'ネギ', 'S'].includes(vegName)) {
      jpName = vegName === 'S' ? 'プチトマト' : vegName;
      size = 'S';
    }

    const stage = task.growth_stage;
    let path = '';
    let label = '';
    let bgColor = '';
    
    let scaleMultiplier = 1; 
    let bottomOffset = '0px'; 

    if (stage === -1) {
      path = `/野菜${size}/枯れ_${jpName}.png`;
      label = '枯れ';
      bgColor = '#795548';
    } else if (stage === 0) {
      path = `/種が埋まっている土.png`;
      label = '種';
      bgColor = '#8d6e63';
      scaleMultiplier = 0.2;
      bottomOffset = '-18px'; 
    } else if (stage >= 1 && stage <= 10) {
      path = `/野菜${size}/(${stage})_${jpName}.png`;
      label = `LV-${stage}`;
      bgColor = 'rgba(0,0,0,0.6)';
    } else if (stage >= 11) {
      path = `/野菜${size}/収穫_${jpName}.png`;
      label = '🎉収穫!';
      bgColor = '#81c784';
    } else {
      path = `/種が埋まっている土.png`;
      label = '種';
      bgColor = '#8d6e63';
      scaleMultiplier = 0.2;
      bottomOffset = '-18px'; 
    }

    return { path, size, jpName, label, bgColor, scaleMultiplier, bottomOffset };
  };

  return (
    <div style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '10px', position: 'relative' }}>
      
      <style>{`
        @keyframes popUpFadeIn {
          0% { opacity: 0; transform: translate(-50%, 10px); }
          100% { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      <div style={{
        position: 'absolute',
        top: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'rgba(76, 175, 80, 0.95)',
        color: '#fff',
        padding: '12px 24px',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        zIndex: 100,
        cursor: 'pointer',
        whiteSpace: 'pre-wrap',
        fontSize: '14px',
        fontWeight: 'bold',
        opacity: systemMessage && !isClearingSystemMessage ? 1 : 0,
        pointerEvents: systemMessage && !isClearingSystemMessage ? 'auto' : 'none',
        transition: 'opacity 0.3s ease',
        width: 'max-content',
        maxWidth: '90%'
      }} onClick={() => {
        setIsClearingSystemMessage(true);
        setTimeout(() => {
          if (onClearSystemMessage) onClearSystemMessage();
        }, 300);
      }}>
        {systemMessage}
      </div>

      <h3 style={{ margin: '0 0 10px 0', color: '#4caf50' }}>マイベジタブル畑</h3>

      <div style={{
        position: 'relative',
        width: '450px',
        height: '400px',
        margin: '0 auto',
        backgroundImage: 'url("/VegeTASK_畑.png")',
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center'
      }}>
        
        {field.map((task, index) => {
          if (!task || task.vegetable_name === undefined) return null;

          const { path, label, bgColor, scaleMultiplier, bottomOffset } = getVegetableInfo(task);
          const pos = GRID_POSITIONS[index] || { top: '50%', left: '50%' };
          const isAnimating = recentCompleted.has(task.sub_task_id);
          const growthMsg = growthMsgs[task.sub_task_id];

          return (
            <div 
              key={index}
              style={{
                position: 'absolute',
                top: pos.top,
                left: pos.left,
                width: '60px',
                height: '60px',
                transform: 'translate(-50%, -80%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                zIndex: index
              }}
            >
              <div style={{ position: 'relative', width: '100%', flex: 1 }}>
                
                {growthMsg && (
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      setGrowthMsgs(prev => {
                        const next = { ...prev };
                        delete next[task.sub_task_id];
                        return next;
                      });
                    }}
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      backgroundColor: '#fff',
                      color: '#ff9800',
                      border: '2px solid #ff9800',
                      padding: '4px 10px',
                      borderRadius: '16px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      zIndex: 10,
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                      animation: 'popUpFadeIn 0.3s ease-out forwards',
                    }}
                  >
                    {growthMsg}
                  </div>
                )}

                <img 
                  key={path}
                  src={path} 
                  alt={task.task_title || '野菜'}
                  style={{ 
                    position: 'absolute',
                    bottom: bottomOffset,
                    left: '50%',
                    transform: `translateX(-50%) scale(${ASSET_SCALE * scaleMultiplier})`, 
                    transformOrigin: 'bottom center',
                    width: 'auto',
                    height: 'auto',
                    imageRendering: 'pixelated',
                    opacity: task.growth_stage === -1 ? 0 : (isAnimating ? 0.4 : 1),
                    transition: 'opacity 1s ease',
                  }} 
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
              <span style={{ 
                fontSize: '8px', 
                color: '#fff', 
                backgroundColor: bgColor, 
                padding: '1px 3px', 
                borderRadius: '3px',
                zoom: 0.8,
                whiteSpace: 'nowrap',
                marginTop: '2px',
                position: 'relative',
                zIndex: 2
              }}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VegetableField;