import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import './HarvestBasket.css';

type HarvestedVegetable = {
  harvest_id: string;
  task_id: string;
  vegetable_name: string;
  vegetable_size: string;
  image_url: string;
  harvested_at: string;
};

type VisualHarvest = HarvestedVegetable & {
  screenX: number;
  screenY: number;
  zIndex: number;
  rotation: number;
  scale: number;
};

function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const LOCAL_STORAGE_BASKET_KEY = 'harvest_basket_positions';

const HarvestBasket: React.FC = () => {
  const [harvests, setHarvests] = useState<VisualHarvest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

  useEffect(() => {
    const fetchHarvestData = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${API_BASE_URL}/api/harvest_basket`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error('データの取得に失敗しました');
        }
        const data: HarvestedVegetable[] = await response.json();

        const rand = mulberry32(12345);

        const cx = 50; 
        const cy = 60; 
        const rx = 35;
        const rz = 12;
        const min_dist = 8;
        const stack_h = 5;

        const placed: { x: number, z: number, y: number }[] = [];
        
        const storedPositionsStr = localStorage.getItem(LOCAL_STORAGE_BASKET_KEY);
        const storedPositions = storedPositionsStr ? JSON.parse(storedPositionsStr) : {};

        const calculatedData: VisualHarvest[] = data.map((veg) => {
          if (storedPositions[veg.harvest_id]) {
            const pos = storedPositions[veg.harvest_id];
            placed.push({ 
              x: pos.screenX - cx, 
              z: pos.screenY - cy, 
              y: 0 
            });
            
            return {
              ...veg,
              screenX: pos.screenX,
              screenY: pos.screenY,
              zIndex: pos.zIndex,
              rotation: pos.rotation,
              scale: pos.scale || 1.0
            };
          }

          const r = Math.sqrt(rand()); 
          const theta = rand() * 2 * Math.PI;
          const x = r * Math.cos(theta) * rx;
          const z = r * Math.sin(theta) * rz;

          const nx = x / rx;
          const nz = z / rz;
          let y = 8 * (nx * nx + nz * nz);

          for (const p of placed) {
            const dx = x - p.x;
            const dz = z - p.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            if (dist < min_dist) {
              const height_boost = stack_h - (dist / min_dist) * (stack_h * 0.8);
              y = Math.max(y, p.y + height_boost);
            }
          }
          placed.push({ x, z, y });

          const screenX = cx + x;
          const screenY = cy + z - y;
          const zIndex = Math.floor(screenY * 100);
          const rotation = rand() * 60 - 30;

          return { 
            ...veg, 
            screenX, 
            screenY, 
            zIndex, 
            rotation, 
            scale: 1.0
          };
        });

        const positionsToStore: Record<string, any> = {};
        calculatedData.forEach(v => {
          positionsToStore[v.harvest_id] = {
            screenX: v.screenX,
            screenY: v.screenY,
            zIndex: v.zIndex,
            rotation: v.rotation,
            scale: v.scale
          };
        });
        localStorage.setItem(LOCAL_STORAGE_BASKET_KEY, JSON.stringify(positionsToStore));

        setHarvests(calculatedData);
        setLoading(false);
      } catch (err: any) {
        setError('収穫データの取得に失敗しました');
        setLoading(false);
      }
    };

    fetchHarvestData();
  }, [API_BASE_URL]);

  const handlePointerDown = (e: React.PointerEvent<HTMLImageElement>, id: string) => {
    setDraggingId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLImageElement>, id: string) => {
    if (draggingId !== id) return;
    
    const parent = e.currentTarget.parentElement;
    const width = parent ? parent.offsetWidth : window.innerWidth;
    const height = parent ? parent.offsetHeight : window.innerHeight;

    const moveX = (e.movementX / width) * 100;
    const moveY = (e.movementY / height) * 100;

    const cx = 50; 
    const cy = 60; 
    const rx = 35;
    const rz = 12;

    setHarvests(prev => prev.map(veg => {
      if (veg.harvest_id === id) {
        let nextX = veg.screenX + moveX;
        let nextY = veg.screenY + moveY;

        nextX = Math.max(cx - rx, Math.min(cx + rx, nextX));

        const dx = nextX - cx;
        const maxDy = Math.sqrt(1 - Math.pow(dx / rx, 2)) * rz;
        const maxY = cy + maxDy; 
        nextY = Math.min(maxY, nextY);

        const minY = 20;
        nextY = Math.max(minY, nextY);

        return {
          ...veg,
          screenX: nextX,
          screenY: nextY,
        };
      }
      return veg;
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLImageElement>, id: string) => {
    if (draggingId !== id) return;
    setDraggingId(null);
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    setHarvests(prev => {
      const next = prev.map(veg => {
        if (veg.harvest_id === id) {
          return {
            ...veg,
            zIndex: Math.floor(veg.screenY * 100)
          };
        }
        return veg;
      });

      const positionsToStore: Record<string, any> = {};
      next.forEach(v => {
        positionsToStore[v.harvest_id] = {
          screenX: v.screenX,
          screenY: v.screenY,
          zIndex: v.zIndex,
          rotation: v.rotation,
          scale: v.scale
        };
      });
      localStorage.setItem(LOCAL_STORAGE_BASKET_KEY, JSON.stringify(positionsToStore));

      return next;
    });
  };

  const getFallbackImagePath = (vegName: string, vegSize: string) => {
    let size = vegSize || 'L';
    let jpName = 'かぼちゃ';

    if (['かぼちゃ', 'kabocha', 'pumpkin', 'L'].includes(vegName)) {
      jpName = 'かぼちゃ';
      size = 'L';
    } else if (['キャベツ', 'cabbage'].includes(vegName)) {
      jpName = 'キャベツ';
      size = 'L';
    } else if (['トウモロコシ', 'corn'].includes(vegName)) {
      jpName = 'トウモロコシ';
      size = 'L';
    } else if (['ブロッコリー', 'broccoli'].includes(vegName)) {
      jpName = 'ブロッコリー';
      size = 'L';
    } else if (['カリフラワー', 'cauliflower'].includes(vegName)) {
      jpName = 'カリフラワー';
      size = 'L';
    } else if (['赤パプリカ', 'ピーマン', 'なす', 'キュウリ', 'タケノコ', 'M'].includes(vegName)) {
      jpName = vegName === 'M' ? 'なす' : vegName;
      size = 'M';
    } else if (['プチトマト', 'オクラ', '枝豆', 'シイタケ', 'ネギ', 'S'].includes(vegName)) {
      jpName = vegName === 'S' ? 'プチトマト' : vegName;
      size = 'S';
    }

    return `/野菜${size}/収穫_${jpName}.png`;
  };

  if (loading) return <Layout><div style={{ padding: 20, textAlign: 'center' }}>読み込み中…</div></Layout>;
  if (error) return <Layout><div style={{ padding: 20, color: 'red', textAlign: 'center', fontWeight: 'bold' }}>{error}</div></Layout>;

  return (
    <Layout>
      <div className="basket-container">
        
        <div className="basket-title-wrapper">
          <h1 className="basket-title">収穫かご</h1>
        </div>

        <div className="basket-card">
          
          <div className="basket-area">
            <div className="basket-stage">
              
              <img 
                src="/VegeTASK_籠(後).png" 
                alt="籠の背面"
                className="basket-layer-back"
              />

              <div className="basket-veg-container">
                {harvests.length === 0 ? (
                  <></>
                ) : (
                  harvests.map((veg) => {
                    const isDragging = draggingId === veg.harvest_id;
                    
                    return (
                      <img 
                        key={veg.harvest_id}
                        title={`${veg.vegetable_name} (収穫日: ${veg.harvested_at})`}
                        src={veg.image_url || getFallbackImagePath(veg.vegetable_name, veg.vegetable_size)}
                        alt={veg.vegetable_name}
                        draggable={false}
                        className="basket-veg-item"
                        style={{
                          left: `${veg.screenX}%`,
                          top: `${veg.screenY}%`,
                          width: `${12 * veg.scale}%`,
                          zIndex: isDragging ? 999999 : veg.zIndex,
                          cursor: isDragging ? 'grabbing' : 'grab',
                          filter: isDragging 
                            ? `drop-shadow(0px 20px 15px rgba(0,0,0,0.4))` 
                            : `drop-shadow(0px 3px 4px rgba(0,0,0,0.4))`,
                          transition: isDragging 
                            ? 'none' 
                            : 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), filter 0.2s',
                          transform: isDragging
                            ? `translate(-50%, calc(-100% - 2vw)) rotate(${veg.rotation}deg) scale(1.15)`
                            : `translate(-50%, -100%) rotate(${veg.rotation}deg)`
                        }}
                        onPointerDown={(e) => handlePointerDown(e, veg.harvest_id)}
                        onPointerMove={(e) => handlePointerMove(e, veg.harvest_id)}
                        onPointerUp={(e) => handlePointerUp(e, veg.harvest_id)}
                        onMouseEnter={(e) => {
                          if (draggingId) return;
                          e.currentTarget.style.transform = `translate(-50%, calc(-100% - 1.5vw)) rotate(${veg.rotation}deg) scale(1.15)`;
                          e.currentTarget.style.zIndex = '9999';
                        }}
                        onMouseLeave={(e) => {
                          if (draggingId) return;
                          e.currentTarget.style.transform = `translate(-50%, -100%) rotate(${veg.rotation}deg)`;
                          e.currentTarget.style.zIndex = String(veg.zIndex);
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          const fallback = getFallbackImagePath(veg.vegetable_name, veg.vegetable_size);
                          if (!target.src.includes(fallback)) {
                            target.src = fallback;
                          } else {
                            target.style.display = 'none';
                          }
                        }}
                      />
                    );
                  })
                )}
              </div>

              <img 
                src="/VegeTASK_籠(前).png" 
                alt="籠の前面"
                className="basket-layer-front"
              />
            </div>
          </div>

          <div className="basket-summary">
            <h3 className="basket-summary-title">これまでの成果</h3>
            <p className="basket-summary-text">
              合計収穫数: <span className="basket-summary-count">{harvests.length}</span> 個
            </p>
          </div>

        </div>
      </div>
    </Layout>
  );
};

export default HarvestBasket;