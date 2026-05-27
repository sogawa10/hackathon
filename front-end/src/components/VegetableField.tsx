import React from 'react';

interface TodaySubtask {
  sub_task_id: string;
  scheduled_date: string;
  task_type: string;
  task_title: string;
  task_content: string;
  is_completed: boolean;
  vegetable_name: string;
  growth_stage: number;
}

interface VegetableFieldProps {
  subtasks: (TodaySubtask | null)[];
}

const PLACEMENT_ORDER: number[] = [
  12, 8, 16, 4, 20, 18, 14, 22, 24, 6, 2, 10, 0, 13, 17, 9, 21, 19, 23, 7, 11, 3, 15, 1, 5
];

const GRID_POSITIONS: { [key: number]: { top: string; left: string } } = {
0:  { top: '28%', left: '50.5%' },
  1:  { top: '33.5%', left: '41%' },
  2:  { top: '39.5%', left: '31.5%' },
  3:  { top: '44%', left: '22%' },
  4:  { top: '49.25%', left: '12.5%' },

  5:  { top: '34.25%', left: '60%' },
  6:  { top: '39%', left: '50.5%' },
  7:  { top: '44%', left: '41%' },
  8:  { top: '50.25%', left: '31.5%' },
  9:  { top: '54.5%', left: '22%' },

  10: { top: '38.5%', left: '69.5%' },
  11: { top: '44.75%', left: '60%' },
  12: { top: '49.5%', left: '50.5%' },
  13: { top: '54.5%', left: '41%' },
  14: { top: '61%', left: '31.5%' },

  15: { top: '44.25%', left: '79%' },
  16: { top: '49.5%', left: '69.5%' },
  17: { top: '55.5%', left: '60%' },
  18: { top: '60.25%', left: '50.5%' },
  19: { top: '65.25%', left: '41%' },

  20: { top: '50.5%', left: '88.5%' },
  21: { top: '55%', left: '79%' },
  22: { top: '60.25%', left: '69.5%' },
  23: { top: '66.5%', left: '60%' },
  24: { top: '71%', left: '50.5%' }
};

const VegetableField: React.FC<VegetableFieldProps> = ({ subtasks = [] }) => {
  const field: (TodaySubtask | null)[] = Array(25).fill(null);

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

    if (stage >= 10) {
      path = `/野菜${size}/収穫_${jpName}.png`;
    } else {
      const fileStage = stage <= 0 ? 1 : stage;
      path = `/野菜${size}/(${fileStage})_${jpName}.png`;
    }

    return { path, size, jpName };
  };

  return (
    <div style={{ fontFamily: 'sans-serif', textAlign: 'center', padding: '10px' }}>
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

          const { path, size, jpName } = getVegetableInfo(task);
          const pos = GRID_POSITIONS[index] || { top: '50%', left: '50%' };

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
              <img 
                src={path} 
                alt={task.task_title || '野菜'}
                style={{ 
                  width: `${45 + task.growth_stage * 5}%`, 
                  height: `${45 + task.growth_stage * 5}%`, 
                  objectFit: 'contain',
                  imageRendering: 'pixelated',
                  opacity: task.is_completed ? 0.4 : 1,
                  transition: 'all 0.3s ease'
                }} 
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  const fallbackStage = task.growth_stage >= 10 ? '収穫' : `(${task.growth_stage <= 0 ? 1 : task.growth_stage})`;
                  const filename = task.growth_stage >= 10 ? `収穫_${jpName}.png` : `${fallbackStage}_${jpName}.png`;
                  
                  if (!target.src.includes(filename)) {
                    target.src = `/野菜${size}/${filename}`;
                  } else {
                    target.style.display = 'none';
                  }
                }}
              />
              <span style={{ 
                fontSize: '8px', 
                color: '#fff', 
                backgroundColor: task.growth_stage >= 10 ? '#81c784' : 'rgba(0,0,0,0.6)', 
                padding: '1px 3px', 
                borderRadius: '3px',
                zoom: 0.8,
                whiteSpace: 'nowrap',
                marginTop: '2px'
              }}>
                {task.growth_stage >= 10 ? '🎉収穫!' : `LV-${task.growth_stage}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VegetableField;