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
  0:  { top: '24.5%', left: '50.25%' },
  1:  { top: '29.75%', left: '40.75%' },
  2:  { top: '35.5%', left: '31.25%' },
  3:  { top: '40.5%', left: '21.75%' },
  4:  { top: '45.75%', left: '12.25%' },
  5:  { top: '29.75%', left: '59.9%' },
  6:  { top: '35.5%', left: '50.25%' },
  7:  { top: '40.5%', left: '40.75%' },
  8:  { top: '45.75%', left: '31.25%' },
  9:  { top: '51.5%', left: '21.5%' },
  10: { top: '35.5%', left: '69.5%' },
  11: { top: '40.5%', left: '59.9%' },
  12: { top: '45.75%', left: '50.25%' },
  13: { top: '51.5%', left: '40.75%' },
  14: { top: '56.75%', left: '31.25%' },
  15: { top: '40.5%', left: '79%' },
  16: { top: '45.75%', left: '69.5%' },
  17: { top: '51.5%', left: '59.9%' },
  18: { top: '56.75%', left: '50.25%' },
  19: { top: '62%', left: '40.75%' },
  20: { top: '45.75%', left: '88.4%' },
  21: { top: '51.5%', left: '78.5%' },
  22: { top: '56.75%', left: '69.25%' },
  23: { top: '62%', left: '59.9%' },
  24: { top: '67.5%', left: '50.25%' }
};

const ASSET_SCALE = 0.3;
const LOCAL_STORAGE_POSITIONS_KEY = 'vegetable_field_positions';

const VegetableField: React.FC<VegetableFieldProps> = ({ subtasks = [], systemMessage, onClearSystemMessage, onHarvestClick }) => {
  const field: (TodaySubtask | null)[] = Array(25).fill(null);
  
  const [recentCompleted, setRecentCompleted] = useState<Set<string>>(new Set());
  const [growthMsgs, setGrowthMsgs] = useState<{ [subTaskId: string]: string }>({});
  const [isClearingSystemMessage, setIsClearingSystemMessage] = useState(false);
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const [boardScale, setBoardScale] = useState(1);

  const prevSubtasksRef = useRef<(TodaySubtask | null)[]>([]);

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setBoardScale(entry.contentRect.height / 600);
      }
    });
    if (boardRef.current) {
      observer.observe(boardRef.current);
    }
    return () => observer.disconnect();
  }, []);

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
    let bottomOffsetBase = 0; 
    let statusText = ''; 
    
    if (stage === -1) {
      path = `/野菜${size}/枯れ_${jpName}.png`;
      //label = '枯れ';
      bgColor = '#795548';
      statusText = '枯れ';
    } else if (stage === 0) {
      path = `/種が埋まっている土.png`;
      //label = '種';
      bgColor = '#8d6e63';
      scaleMultiplier = 0.2;
      bottomOffsetBase = -18; 
      statusText = '種';
    } else if (stage >= 1 && stage <= 9) {
      path = `/野菜${size}/(${stage})_${jpName}.png`;
      //label = `LV-${stage}`;
      bgColor = 'rgba(0,0,0,0.6)';
      statusText = `LV-${stage}`;
    } else if (stage === 10) {
      path = `/野菜${size}/(${stage})_${jpName}.png`;
      //label = '✨収穫する✨';
      bgColor = '#ff9800';
      statusText = '✨収穫する✨';
    } else {
      path = '';
      //label = '';
      bgColor = 'transparent';
    }

    return { path, size, jpName, label, bgColor, scaleMultiplier, bottomOffsetBase, statusText };
  };

  return (
    <div className="field-container">
      
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

      <div className="field-board" ref={boardRef}>
        {field.map((task, index) => {
          if (!task || task.vegetable_name === undefined) return null;

          const { path, label, bgColor, scaleMultiplier, bottomOffsetBase, statusText } = getVegetableInfo(task);
          const pos = GRID_POSITIONS[index] || { top: '50%', left: '50%' };
          const isAnimating = recentCompleted.has(task.sub_task_id);
          const growthMsg = growthMsgs[task.sub_task_id];

          const currentScale = ASSET_SCALE * scaleMultiplier * boardScale;
          const bottomOffset = `${bottomOffsetBase * boardScale}px`;

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

                {hoveredTask === task.sub_task_id && !growthMsg && (
                  <div 
                    className="popup-tooltip hover-task-name"
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      gap: '6px', 
                      padding: '8px 12px',
                      backgroundColor: '#ffffff',
                      color: '#333333',
                      border: '2px solid #ff9800'
                    }}
                  >
                    {statusText && (
                      <span style={{ 
                        backgroundColor: bgColor === 'rgba(0,0,0,0.6)' ? '#4caf50' : bgColor, 
                        color: '#fff', 
                        padding: '4px 10px', 
                        borderRadius: '12px', 
                        fontSize: '11px', 
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                      }}>
                        {statusText}
                      </span>
                    )}
                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                      {task.task_title}
                    </span>
                  </div>
                )}

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
                      '--target-scale': currentScale,
                      transform: `translateX(-50%) scale(${currentScale})`, 
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