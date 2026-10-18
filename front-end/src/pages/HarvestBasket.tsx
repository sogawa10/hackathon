import React, { useCallback, useEffect, useRef, useState } from 'react';
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

type AlphaMap = { width: number; height: number; data: Uint8ClampedArray };

type DragState = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  grabX: number;
  grabY: number;
  moved: boolean;
};

const DRAG_THRESHOLD = 5;
const HIT_TOLERANCE = 4;
const KEY_STEP = 1;
const KEY_STEP_LARGE = 4;

const formatHarvestDate = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${year}年${month}月${day}日に収穫`;
};

const loadAlphaMap = (src: string) =>
  new Promise<AlphaMap>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        reject(new Error('canvas'));
        return;
      }
      context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ width: canvas.width, height: canvas.height, data });
    };
    image.onerror = reject;
    image.src = src;
  });

const HarvestBasket: React.FC = () => {
  const [harvests, setHarvests] = useState<VisualHarvest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const alphaMaps = useRef(new Map<string, AlphaMap>());
  const rawHarvests = useRef<HarvestedVegetable[]>([]);

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
        rawHarvests.current = data;
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

  useEffect(() => {
    const paths = new Set(harvests.map(getImagePath));
    paths.forEach((path) => {
      if (alphaMaps.current.has(path)) return;
      loadAlphaMap(path)
        .then((map) => alphaMaps.current.set(path, map))
        .catch(() => undefined);
    });
  }, [harvests]);

  const hitTest = useCallback((clientX: number, clientY: number) => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const ordered = [...harvests].sort((a, b) => b.zIndex - a.zIndex);

    for (const veg of ordered) {
      const shape = getShape(veg);
      const width = getFootprint(veg).width / 100 * rect.width;
      const height = width * shape.imageHeight / shape.imageWidth;
      const anchorX = rect.left + veg.screenX / 100 * rect.width;
      const anchorY = rect.top + veg.screenY / 100 * rect.height;
      const angle = veg.rotation * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const dx = clientX - anchorX;
      const dy = clientY - anchorY;
      const localX = cos * dx + sin * dy + width / 2;
      const localY = -sin * dx + cos * dy + height;

      if (localX < -HIT_TOLERANCE || localX > width + HIT_TOLERANCE) continue;
      if (localY < -HIT_TOLERANCE || localY > height + HIT_TOLERANCE) continue;

      const map = alphaMaps.current.get(getImagePath(veg));
      if (!map) return veg.harvest_id;

      const offsets = [[0, 0], [HIT_TOLERANCE, 0], [-HIT_TOLERANCE, 0], [0, HIT_TOLERANCE], [0, -HIT_TOLERANCE]];
      for (const [ox, oy] of offsets) {
        const px = Math.floor((localX + ox) / width * map.width);
        const py = Math.floor((localY + oy) / height * map.height);
        if (px < 0 || py < 0 || px >= map.width || py >= map.height) continue;
        if (map.data[(py * map.width + px) * 4 + 3] > 48) return veg.harvest_id;
      }
    }
    return null;
  }, [harvests]);

  const toPercent = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width * 100,
      y: (clientY - rect.top) / rect.height * 100,
    };
  };

  const moveVegetable = (id: string, x: number, y: number) => {
    setHarvests(prev => prev.map(veg => {
      if (veg.harvest_id !== id) return veg;
      const next = clampToBasket(veg, x, y);
      return { ...veg, screenX: next.x, screenY: next.y };
    }));
  };

  const settleVegetable = (id: string) => {
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

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const id = hitTest(e.clientX, e.clientY);
    if (!id) {
      setSelectedId(null);
      return;
    }
    const veg = harvests.find(v => v.harvest_id === id)!;
    const point = toPercent(e.clientX, e.clientY);
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      grabX: point.x - veg.screenX,
      grabY: point.y - veg.screenY,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) {
      if (e.pointerType === 'mouse') setHoverId(hitTest(e.clientX, e.clientY));
      return;
    }
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD) return;
      drag.moved = true;
      setDraggingId(drag.id);
      setSelectedId(null);
    }
    const point = toPercent(e.clientX, e.clientY);
    moveVegetable(drag.id, point.x - drag.grabX, point.y - drag.grabY);
  };

  const finishPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (drag.moved) {
      setDraggingId(null);
      settleVegetable(drag.id);
    } else {
      setSelectedId(current => (current === drag.id ? null : drag.id));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLImageElement>, veg: VisualHarvest) => {
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [mx, my] = moves[e.key];
      moveVegetable(veg.harvest_id, veg.screenX + mx, veg.screenY + my * STAGE_ASPECT);
      settleVegetable(veg.harvest_id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelectedId(current => (current === veg.harvest_id ? null : veg.harvest_id));
    } else if (e.key === 'Escape') {
      setSelectedId(null);
    }
  };

  const rearrange = () => {
    const arranged = arrangeInBasket(rawHarvests.current, {});
    storePositions(arranged);
    setHarvests(arranged);
    setSelectedId(null);
  };

  const selected = harvests.find(v => v.harvest_id === selectedId) || null;

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
              alt=""
              aria-hidden="true"
              className="basket-layer-back"
            />
            <div className="basket-hollow" aria-hidden="true" />

            <div
              ref={containerRef}
              className={`basket-veg-container${draggingId ? ' is-dragging' : hoverId ? ' is-hovering' : ''}`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={finishPointer}
              onPointerCancel={finishPointer}
              onPointerLeave={() => setHoverId(null)}
            >
              {harvests.map((veg) => {
                const isDragging = draggingId === veg.harvest_id;
                const isActive = hoverId === veg.harvest_id || selectedId === veg.harvest_id;
                const { width } = getFootprint(veg);

                return (
                  <img
                    key={veg.harvest_id}
                    src={getImagePath(veg)}
                    alt={`${veg.vegetable_name}（${formatHarvestDate(veg.harvested_at)}）`}
                    draggable={false}
                    tabIndex={0}
                    role="button"
                    aria-pressed={selectedId === veg.harvest_id}
                    className={`basket-veg-item${isDragging ? ' is-dragging' : ''}${isActive && !isDragging ? ' is-active' : ''}`}
                    style={{
                      left: `${veg.screenX}%`,
                      top: `${veg.screenY}%`,
                      width: `${width}%`,
                      zIndex: isDragging ? 9999 : veg.zIndex,
                      '--veg-rotation': `${veg.rotation}deg`,
                    } as React.CSSProperties}
                    onKeyDown={(e) => handleKeyDown(e, veg)}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                );
              })}
            </div>

            <img
              src="/VegeTASK_籠(前).png"
              alt=""
              aria-hidden="true"
              className="basket-layer-front"
            />
            <div className="basket-submerge" aria-hidden="true" />
            <div className="basket-waterline" aria-hidden="true" />
            <div className="basket-water basket-water-front" aria-hidden="true">
              <span className="basket-ripple" />
              <span className="basket-ripple" />
              <span className="basket-ripple" />
            </div>

            {selected && !draggingId && (
              <div
                className="basket-tag"
                role="status"
                style={{
                  left: `${selected.screenX}%`,
                  top: `${selected.screenY - getFootprint(selected).height}%`,
                }}
              >
                <span className="basket-tag-name">{selected.vegetable_name}</span>
                <span className="basket-tag-date">{formatHarvestDate(selected.harvested_at)}</span>
              </div>
            )}
          </div>

          {harvests.length === 0 ? (
            <p className="basket-hint">育ち切った野菜を畑でクリックすると、ここに入ります。</p>
          ) : (
            <div className="basket-hint">
              <span>ドラッグで移動、タップで名前と収穫日</span>
              <button type="button" className="basket-rearrange" onClick={rearrange}>
                並べ直す
              </button>
            </div>
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
