import React, { useEffect, useRef, useState } from 'react';
import './VegetableField.css';

interface TodaySubtask {
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
}

interface VegetableFieldProps {
  subtasks: (TodaySubtask | null)[];
  systemMessage?: string | null;
  onClearSystemMessage?: () => void;
  onHarvestClick?: (task: TodaySubtask) => void;
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
const LOCAL_STORAGE_POSITIONS_KEY = 'vegetable_field_positions';

const VegetableField: React.FC<VegetableFieldProps> = ({ subtasks = [], systemMessage, onClearSystemMessage, onHarvestClick }) => {
  const field: (TodaySubtask | null)[] = Array(25).fill(null);
  
  const [recentCompleted, setRecentCompleted] = useState<Set<string>>(new Set());
  const [growthMsgs, setGrowthMsgs] = useState<{ [subTaskId: string]: string }>({});
  const [isClearingSystemMessage, setIsClearingSystemMessage] = useState(false);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

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
          newGrowthMsgs[task.sub_task_id] = `${task.vegetable_name || '野菜'}が成長しました！✨`;
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
    let taskPositions: { [taskId: string]: number } = {};
    try {
      const storedPositions = localStorage.getItem(LOCAL_STORAGE_POSITIONS_KEY);
      if (storedPositions) {
        taskPositions = JSON.parse(storedPositions);
      }
    } catch (e) {
      console.error(e);
    }

    const currentTaskIds = new Set(subtasks.map(t => t?.task_id).filter(Boolean));
    let positionsChanged = false;

    Object.keys(taskPositions).forEach(taskId => {
      if (!currentTaskIds.has(taskId)) {
        delete taskPositions[taskId];
        positionsChanged = true;
      }
    });

    const usedSlots = new Set(Object.values(taskPositions));

    subtasks.forEach(task => {
      if (!task) return;
      if (taskPositions[task.task_id] === undefined) {
        const availableSlot = PLACEMENT_ORDER.find(slot => !usedSlots.has(slot));
        if (availableSlot !== undefined) {
          taskPositions[task.task_id] = availableSlot;
          usedSlots.add(availableSlot);
          positionsChanged = true;
        }
      }
    });

    if (positionsChanged) {
      localStorage.setItem(LOCAL_STORAGE_POSITIONS_KEY, JSON.stringify(taskPositions));
    }

    subtasks.forEach(task => {
      if (!task) return;
      const pos = taskPositions[task.task_id];
      if (pos !== undefined) {
        field[pos] = task;
      }
    });
  }

  const getVegetableInfo = (task: TodaySubtask) => {
    let vegName = task.vegetable_name || 'かぼちゃ';
    let size = 'L';
    let jpName = 'かぼちゃ';

    if (['かぼちゃ', 'kabocha', 'pumpkin', 'L'].includes(vegName)) { jpName = 'かぼちゃ'; size = 'L'; }
    else if (['キャベツ', 'cabbage'].includes(vegName)) { jpName = 'キャベツ'; size = 'L'; }
    else if (['トウモロコシ', 'corn'].includes(vegName)) { jpName = 'トウモロコシ'; size = 'L'; }
    else if (['ブロッコリー', 'broccoli'].includes(vegName)) { jpName = 'ブロッコリー'; size = 'L'; }
    else if (['カリフラワー', 'cauliflower'].includes(vegName)) { jpName = 'カリフラワー'; size = 'L'; }
    else if (['赤パプリカ', 'ピーマン', 'なす', 'キュウリ', 'タケノコ', 'M'].includes(vegName)) { jpName = vegName === 'M' ? 'なす' : vegName; size = 'M'; }
    else if (['プチトマト', 'オクラ', '枝豆', 'シイタケ', 'ネギ', 'S'].includes(vegName)) { jpName = vegName === 'S' ? 'プチトマト' : vegName; size = 'S'; }

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
    } else if (stage >= 1 && stage <= 9) {
      path = `/野菜${size}/(${stage})_${jpName}.png`;
      label = `LV-${stage}`;
      bgColor = 'rgba(0,0,0,0.6)';
    } else if (stage === 10) {
      path = `/野菜${size}/(${stage})_${jpName}.png`;
      label = '✨収穫する✨';
      bgColor = '#ff9800';
    } else {
      path = '';
      label = '';
      bgColor = 'transparent';
    }

    return { path, size, jpName, label, bgColor, scaleMultiplier, bottomOffset };
  };

  return (
    <div className="field-container">
      
      {/* システムメッセージ（水やり・成長通知など） */}
      <div 
        className="system-toast"
        style={{
          opacity: systemMessage && !isClearingSystemMessage ? 1 : 0,
          pointerEvents: systemMessage && !isClearingSystemMessage ? 'auto' : 'none',
        }}
        onClick={() => {
          setIsClearingSystemMessage(true);
          setTimeout(() => {
            if (onClearSystemMessage) onClearSystemMessage();
          }, 300);
        }}
      >
        {systemMessage}
      </div>

      <h3 className="field-title">マイベジタブル畑</h3>

      <div className="field-board">
        {field.map((task, index) => {
          if (!task || task.vegetable_name === undefined) return null;

          const { path, label, bgColor, scaleMultiplier, bottomOffset } = getVegetableInfo(task);
          const pos = GRID_POSITIONS[index] || { top: '50%', left: '50%' };
          const isAnimating = recentCompleted.has(task.sub_task_id);
          const growthMsg = growthMsgs[task.sub_task_id];

          return (
            <div 
              key={index}
              className="crop-slot"
              onMouseEnter={() => setHoveredTask(task.sub_task_id)}
              onMouseLeave={() => setHoveredTask(null)}
              style={{
                top: pos.top,
                left: pos.left,
                zIndex: hoveredTask === task.sub_task_id ? 99 : index
              }}
            >
              <div className="crop-wrapper">
                
                {/* 成長メッセージのポップアップ */}
                {growthMsg && (
                  <div 
                    className="popup-tooltip growth-message"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGrowthMsgs(prev => {
                        const next = { ...prev };
                        delete next[task.sub_task_id];
                        return next;
                      });
                    }}
                  >
                    {growthMsg}
                  </div>
                )}

                {/* ホバー時のタスク名ポップアップ */}
                {hoveredTask === task.sub_task_id && !growthMsg && (
                  <div className="popup-tooltip hover-task-name">
                    {task.task_title}
                  </div>
                )}

                {/* 野菜の画像本体 */}
                {path && (
                  <img 
                    key={path}
                    src={path} 
                    alt={task.task_title || '野菜'}
                    className="crop-image"
                    onClick={(e) => {
                      if (task.growth_stage === 10 && onHarvestClick) {
                        e.stopPropagation();
                        onHarvestClick(task);
                      }
                    }}
                    style={{ 
                      bottom: bottomOffset,
                      '--target-scale': ASSET_SCALE * scaleMultiplier,
                      transform: `translateX(-50%) scale(${ASSET_SCALE * scaleMultiplier})`, 
                      opacity: task.growth_stage === -1 ? 0 : (isAnimating ? 0.4 : 1),
                      cursor: task.growth_stage === 10 ? 'pointer' : 'default',
                      animation: task.growth_stage === 10 ? 'bounceHarvest 2s infinite' : 'none'
                    } as React.CSSProperties} 
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                )}
              </div>

              {/* LV・状態ラベル */}
              {label && (
                <span 
                  className="crop-label" 
                  style={{ backgroundColor: bgColor }}
                >
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VegetableField;