export type VegetableSize = 'S' | 'M' | 'L';

export const VEGETABLES: Record<VegetableSize, string[]> = {
  S: ['プチトマト', 'オクラ', '枝豆', 'シイタケ', 'ネギ'],
  M: ['赤パプリカ', 'ピーマン', 'なす', 'キュウリ', 'タケノコ'],
  L: ['キャベツ', 'かぼちゃ', 'トウモロコシ', 'ブロッコリー', 'カリフラワー'],
};

export const sizeOfVegetable = (name: string): VegetableSize | null => {
  const sizes: VegetableSize[] = ['S', 'M', 'L'];
  return sizes.find((size) => VEGETABLES[size].includes(name)) ?? null;
};

export const cropImagePath = (name: string, growthStage: number): string | null => {
  const size = sizeOfVegetable(name);
  if (!size) return null;
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
