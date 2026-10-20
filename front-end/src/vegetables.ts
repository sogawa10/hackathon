export type VegetableSize = 'S' | 'M' | 'L';

export type Vegetable = {
  vegetable_name: string;
  vegetable_size: VegetableSize;
};

const isVegetableSize = (size: string | undefined): size is VegetableSize =>
  size === 'S' || size === 'M' || size === 'L';

export const cropImagePath = (name: string, size: string | undefined, growthStage: number): string | null => {
  if (!name || !isVegetableSize(size)) return null;
  if (growthStage <= 0) return `/野菜${size}/種_${name}.png`;
  if (growthStage >= 1 && growthStage <= 10) return `/野菜${size}/(${growthStage})_${name}.png`;
  return `/野菜${size}/収穫_${name}.png`;
};

export const TASK_TYPE_CLASS: Record<string, string> = {
  問題集: 'type-mondai',
  単語帳: 'type-tango',
  過去問: 'type-kakomon',
  その他: 'type-other',
};
