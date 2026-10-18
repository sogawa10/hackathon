import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import './HarvestBasket.css';

type HarvestedVegetable = {
  harvest_id: string;
  task_id: string;
  vegetable_name: string;
  vegetable_size: string;
  image_url?: string;
  harvested_at: string;
};

type HarvestPosition = {
  screenX: number;
  screenY: number;
  zIndex: number;
  rotation: number;
};

type VisualHarvest = HarvestedVegetable & HarvestPosition;

type VegetableShape = {
  size: 'S' | 'M' | 'L';
  imageWidth: number;
  imageHeight: number;
  longSide: number;
};

const VEGETABLE_SHAPES: Record<string, VegetableShape> = {
  'かぼちゃ': { size: 'L', imageWidth: 217, imageHeight: 193, longSide: 20 },
  'キャベツ': { size: 'L', imageWidth: 203, imageHeight: 182, longSide: 19.5 },
  'トウモロコシ': { size: 'L', imageWidth: 165, imageHeight: 199, longSide: 20 },
  'ブロッコリー': { size: 'L', imageWidth: 190, imageHeight: 183, longSide: 17.5 },
  'カリフラワー': { size: 'L', imageWidth: 157, imageHeight: 161, longSide: 16.5 },
  'なす': { size: 'M', imageWidth: 157, imageHeight: 168, longSide: 14.5 },
  'キュウリ': { size: 'M', imageWidth: 190, imageHeight: 162, longSide: 16.5 },
  'タケノコ': { size: 'M', imageWidth: 91, imageHeight: 170, longSide: 13.5 },
  'ピーマン': { size: 'M', imageWidth: 132, imageHeight: 162, longSide: 11.5 },
  '赤パプリカ': { size: 'M', imageWidth: 126, imageHeight: 162, longSide: 12.5 },
  'ネギ': { size: 'S', imageWidth: 194, imageHeight: 189, longSide: 18 },
  'オクラ': { size: 'S', imageWidth: 173, imageHeight: 172, longSide: 11.5 },
  '枝豆': { size: 'S', imageWidth: 180, imageHeight: 166, longSide: 11 },
  'シイタケ': { size: 'S', imageWidth: 153, imageHeight: 145, longSide: 9.5 },
  'プチトマト': { size: 'S', imageWidth: 134, imageHeight: 140, longSide: 7.5 },
};

const FALLBACK_VEGETABLE: Record<string, string> = { S: 'プチトマト', M: 'なす', L: 'かぼちゃ' };

const STAGE_ASPECT = 1408 / 768;
const VEGETABLE_SCALE = 0.85;

const BASKET = {
  centerX: 50,
  wallHalfWidth: 39.5,
  floorCenterY: 52.5,
  floorRadiusX: 34,
  floorRadiusY: 11.5,
  floorFrontRadiusY: 19,
  rimCenterY: 40.5,
  rimRadiusX: 41.7,
  rimRadiusY: 19.5,
  maxPileHeight: 20,
  minVisibleRatio: 0.25,
};

const LOCAL_STORAGE_BASKET_KEY = 'harvest_basket_positions_v2';

function mulberry32(a: number) {
  return function() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

const resolveVegetableName = (veg: HarvestedVegetable) =>
  VEGETABLE_SHAPES[veg.vegetable_name]
    ? veg.vegetable_name
    : FALLBACK_VEGETABLE[veg.vegetable_size] || 'かぼちゃ';

const getShape = (veg: HarvestedVegetable) => VEGETABLE_SHAPES[resolveVegetableName(veg)];

const getImagePath = (veg: HarvestedVegetable) => {
  const name = resolveVegetableName(veg);
  return `/野菜${VEGETABLE_SHAPES[name].size}/収穫_${name}.png`;
};

const getFootprint = (veg: HarvestedVegetable) => {
  const { imageWidth, imageHeight } = getShape(veg);
  const longSide = getShape(veg).longSide * VEGETABLE_SCALE;
  const longest = Math.max(imageWidth, imageHeight);
  const width = longSide * imageWidth / longest;
  const height = longSide * imageHeight / longest * STAGE_ASPECT;
  return { width, height, radius: longSide * 0.42 };
};

const frontRimTop = (x: number) => {
  const dx = Math.min(1, Math.abs(x - BASKET.centerX) / BASKET.rimRadiusX);
  return BASKET.rimCenterY + BASKET.rimRadiusY * Math.sqrt(1 - dx * dx);
};

const clampToBasket = (veg: HarvestedVegetable, x: number, y: number) => {
  const { width, height } = getFootprint(veg);
  const maxDx = Math.min(BASKET.floorRadiusX, BASKET.wallHalfWidth - width / 2);
  const nextX = Math.max(BASKET.centerX - maxDx, Math.min(BASKET.centerX + maxDx, x));

  const dx = (nextX - BASKET.centerX) / BASKET.floorRadiusX;
  const span = Math.sqrt(Math.max(0, 1 - dx * dx));
  const floorBack = BASKET.floorCenterY - BASKET.floorRadiusY * span;
  const floorFront = Math.min(
    BASKET.floorCenterY + BASKET.floorFrontRadiusY * span,
    frontRimTop(nextX) + height * (1 - BASKET.minVisibleRatio),
  );
  const nextY = Math.max(floorBack - BASKET.maxPileHeight, Math.min(floorFront, y));

  return { x: nextX, y: nextY };
};

const toPixelDistance = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx;
  const dy = (ay - by) / STAGE_ASPECT;
  return Math.sqrt(dx * dx + dy * dy);
};

const stackingIndex = (
  veg: VisualHarvest,
  x: number,
  y: number,
  others: VisualHarvest[],
) => {
  const { radius } = getFootprint(veg);
  let zIndex = Math.round(y * 10);
  for (const other of others) {
    if (other.harvest_id === veg.harvest_id) continue;
    const reach = radius + getFootprint(other).radius;
    if (toPixelDistance(x, y, other.screenX, other.screenY) < reach * 0.8 && other.screenY - y < 4) {
      zIndex = Math.max(zIndex, other.zIndex + 1);
    }
  }
  return Math.min(zIndex, 9000);
};

const arrangeInBasket = (data: HarvestedVegetable[], stored: Record<string, HarvestPosition>) => {
  const rand = mulberry32(12345);
  const placed: VisualHarvest[] = [];
  const order = data
    .map((veg, index) => ({ veg, index }))
    .sort((a, b) => getShape(b.veg).longSide - getShape(a.veg).longSide || a.index - b.index);

  for (const { veg } of order) {
    const saved = stored[veg.harvest_id];
    if (saved) {
      const { x, y } = clampToBasket(veg, saved.screenX, saved.screenY);
      placed.push({ ...veg, screenX: x, screenY: y, zIndex: saved.zIndex, rotation: saved.rotation });
      continue;
    }

    const { radius } = getFootprint(veg);
    let best = { x: BASKET.centerX, y: BASKET.floorCenterY, score: Infinity, lift: 0, below: 0 };

    for (let attempt = 0; attempt < 48; attempt++) {
      const r = Math.sqrt(rand());
      const theta = rand() * 2 * Math.PI;
      const base = clampToBasket(
        veg,
        BASKET.centerX + r * Math.cos(theta) * BASKET.floorRadiusX,
        BASKET.floorCenterY + r * Math.sin(theta) * (Math.sin(theta) > 0 ? BASKET.floorFrontRadiusY : BASKET.floorRadiusY),
      );

      let overlap = 0;
      let lift = 0;
      let below = 0;
      for (const other of placed) {
        const reach = radius + getFootprint(other).radius;
        const distance = toPixelDistance(base.x, base.y, other.screenX, other.screenY);
        if (distance < reach) {
          const depth = 1 - distance / reach;
          overlap += depth * depth;
          const otherLift = BASKET.floorCenterY + BASKET.floorRadiusY - other.screenY;
          lift = Math.max(lift, depth * getFootprint(other).height * 0.45 + Math.max(0, otherLift) * 0.25);
          below = Math.max(below, other.zIndex + 1);
        }
      }

      const score = overlap + Math.abs(base.x - BASKET.centerX) * 0.004;
      if (score < best.score) {
        best = { x: base.x, y: base.y, score, lift: Math.min(lift, BASKET.maxPileHeight), below };
      }
    }

    const { x, y } = clampToBasket(veg, best.x, best.y - best.lift);
    placed.push({
      ...veg,
      screenX: x,
      screenY: y,
      zIndex: Math.min(9000, Math.max(Math.round(best.y * 10), best.below)),
      rotation: rand() * 24 - 12,
    });
  }

  const byId = new Map(placed.map((veg) => [veg.harvest_id, veg]));
  return data.map((veg) => byId.get(veg.harvest_id)!);
};

const readStoredPositions = (): Record<string, HarvestPosition> => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_BASKET_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const storePositions = (harvests: VisualHarvest[]) => {
  const positions: Record<string, HarvestPosition> = {};
  harvests.forEach((v) => {
    positions[v.harvest_id] = {
      screenX: v.screenX,
      screenY: v.screenY,
      zIndex: v.zIndex,
      rotation: v.rotation,
    };
  });
  try {
    localStorage.setItem(LOCAL_STORAGE_BASKET_KEY, JSON.stringify(positions));
  } catch {
    return;
  }
};

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
        const arranged = arrangeInBasket(data, readStoredPositions());
        storePositions(arranged);

        setHarvests(arranged);
        setLoading(false);
      } catch {
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

    setHarvests(prev => prev.map(veg => {
      if (veg.harvest_id !== id) return veg;
      const { x, y } = clampToBasket(veg, veg.screenX + moveX, veg.screenY + moveY);
      return { ...veg, screenX: x, screenY: y };
    }));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLImageElement>, id: string) => {
    if (draggingId !== id) return;
    setDraggingId(null);
    e.currentTarget.releasePointerCapture(e.pointerId);

    setHarvests(prev => {
      const next = prev.map(veg =>
        veg.harvest_id === id
          ? { ...veg, zIndex: stackingIndex(veg, veg.screenX, veg.screenY, prev) }
          : veg
      );
      storePositions(next);
      return next;
    });
  };

  if (loading) return <Layout><p className="status-line">かごを運んでいます…</p></Layout>;
  if (error) return <Layout><p className="status-line is-error">{error}</p></Layout>;

  return (
    <Layout>
      <div className="basket-scene">
        <div className="basket-scene-far" aria-hidden="true" />
        <div className="basket-scene-seam" aria-hidden="true" />
        <div className="basket-scene-pond" aria-hidden="true" />

        <header className="basket-sign">
          <h1 className="basket-title">収穫かご</h1>
          <p className="basket-summary-text">
            これまでに収穫した野菜 <span className="basket-summary-count">{harvests.length}</span> 個
          </p>
        </header>

        <div className="basket-pool">
          <div className="basket-stage">
            <div className="basket-water" aria-hidden="true">
              <span className="basket-ripple" />
              <span className="basket-ripple" />
              <span className="basket-ripple" />
            </div>

            <img
              src="/VegeTASK_籠(後).png"
              alt="籠の背面"
              className="basket-layer-back"
            />
            <div className="basket-shade basket-shade-back" aria-hidden="true" />
            <div className="basket-hollow" aria-hidden="true" />

            <div className="basket-veg-container">
              {harvests.map((veg) => {
                const isDragging = draggingId === veg.harvest_id;
                const { width } = getFootprint(veg);

                return (
                  <img
                    key={veg.harvest_id}
                    title={`${veg.vegetable_name} (収穫日: ${veg.harvested_at})`}
                    src={getImagePath(veg)}
                    alt={veg.vegetable_name}
                    draggable={false}
                    className={`basket-veg-item${isDragging ? ' is-dragging' : ''}`}
                    style={{
                      left: `${veg.screenX}%`,
                      top: `${veg.screenY}%`,
                      width: `${width}%`,
                      zIndex: isDragging ? 9999 : veg.zIndex,
                      '--veg-rotation': `${veg.rotation}deg`,
                    } as React.CSSProperties}
                    onPointerDown={(e) => handlePointerDown(e, veg.harvest_id)}
                    onPointerMove={(e) => handlePointerMove(e, veg.harvest_id)}
                    onPointerUp={(e) => handlePointerUp(e, veg.harvest_id)}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                );
              })}
            </div>

            <img
              src="/VegeTASK_籠(前).png"
              alt="籠の前面"
              className="basket-layer-front"
            />
            <div className="basket-shade basket-shade-front" aria-hidden="true" />
            <div className="basket-submerge" aria-hidden="true" />
            <div className="basket-waterline" aria-hidden="true" />
            <div className="basket-water basket-water-front" aria-hidden="true">
              <span className="basket-ripple" />
              <span className="basket-ripple" />
              <span className="basket-ripple" />
            </div>
          </div>

          {harvests.length === 0 ? (
            <p className="basket-hint">育ち切った野菜を畑でクリックすると、ここに入ります。</p>
          ) : (
            <p className="basket-hint">野菜はドラッグして並べ替えられます。</p>
          )}
        </div>

        <div className="basket-scene-light" aria-hidden="true" />

        <svg className="basket-filters" aria-hidden="true">
          <filter id="basket-waterline-wobble" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.01 0.09" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      </div>
    </Layout>
  );
};

export default HarvestBasket;
