INSERT INTO "VEGETABLES" (vegetable_name, size) VALUES
('プチトマト', 'S'),
('オクラ', 'S'),
('枝豆', 'S'),
('シイタケ', 'S'),
('ネギ', 'S'),
('赤パプリカ', 'M'),
('ピーマン', 'M'),
('なす', 'M'),
('キュウリ', 'M'),
('タケノコ', 'M'),
('キャベツ', 'L'),
('かぼちゃ', 'L'),
('トウモロコシ', 'L'),
('ブロッコリー', 'L'),
('カリフラワー', 'L')
ON CONFLICT (vegetable_name) DO NOTHING;