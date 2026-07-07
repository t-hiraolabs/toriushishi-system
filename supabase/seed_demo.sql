-- =======================================================
-- 鳥生獅子連 管理システム — デモ用ダミーデータ
-- =======================================================
-- ※ このファイルは「デモ専用のSupabaseプロジェクト」に対して実行してください。
--    本番DBには絶対に実行しないこと。
--    実行前に 001_initial.sql でスキーマを作成しておくこと。
--
-- ここに含まれる氏名・住所・電話番号はすべて架空のものです。
-- ログイン用パスワードはすべて「demo1234」です。
-- =======================================================

-- 既存デモデータを掃除（再実行できるように）
TRUNCATE TABLE
  answers_events, answers_practices, performances, otabi_schedules, otabi_places,
  child_gear, member_gear, gear_spare, children, memos, game_scores,
  password_reset_requests, push_subscriptions, sessions, events, practices, users
  RESTART IDENTITY CASCADE;

-- -------------------------------------------------------
-- users （パスワードはすべて demo1234）
-- ハッシュ: sha256("demo1234")
-- -------------------------------------------------------
INSERT INTO users (user_id, stored_name, stored_hash, role, status, position, phone, prefecture, city, address_detail, birthday, sns_consent) VALUES
  (1, '山田 太郎', '0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d', 'admin', 'active', '会長',   '090-0000-0001', '愛媛県', 'サンプル市', '獅子町1-1-1', '1980-04-01', 'yes'),
  (2, '鈴木 花子', '0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d', 'user',  'active', '副会長', '090-0000-0002', '愛媛県', 'サンプル市', '獅子町1-2-3', '1988-08-08', 'yes'),
  (3, '佐藤 健',   '0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d', 'user',  'active', '',       '090-0000-0003', '愛媛県', 'サンプル市', '獅子町2-4-6', '1992-01-15', 'no'),
  (4, '田中 一郎', '0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d', 'user',  'active', '会計',   '090-0000-0004', '愛媛県', 'サンプル市', '獅子町3-7-9', '1975-11-30', 'yes'),
  (5, '高橋 実',   '0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d', 'user',  'active', '',       '090-0000-0005', '愛媛県', 'サンプル市', '獅子町4-1-2', '2000-06-20', 'no'),
  (6, '渡辺 新人', '0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d', 'user',  'hold',   '',       '090-0000-0006', '愛媛県', 'サンプル市', '獅子町5-5-5', '1998-03-03', 'no');
SELECT setval('users_user_id_seq', 6);

-- -------------------------------------------------------
-- children
-- -------------------------------------------------------
INSERT INTO children (child_id, user_id, child_name, birthday, role, status) VALUES
  (1, 2, '鈴木 太陽', '2016-05-05', 'child', 'active'),
  (2, 4, '田中 花',   '2018-09-09', 'child', 'active');
SELECT setval('children_child_id_seq', 2);

-- -------------------------------------------------------
-- events
-- -------------------------------------------------------
INSERT INTO events (event_id, date, title, type, time, location, comment, deadline) VALUES
  (1, (CURRENT_DATE + INTERVAL '14 day'),  '春季例大祭',       'festival', '09:00', '鳥生神社',       '衣装を忘れずに持参してください。', '3日前まで'),
  (2, (CURRENT_DATE + INTERVAL '30 day'),  '地域夏祭り 奉納',   'festival', '18:00', '中央公園',       '雨天時は翌日順延。', '1週間前まで'),
  (3, (CURRENT_DATE - INTERVAL '20 day'),  '新年会',           'regular',  '19:00', '料亭さくら',      'お疲れ様でした。', '');
SELECT setval('events_event_id_seq', 3);

INSERT INTO answers_events (event_id, user_id, status) VALUES
  (1, 1, '参加'), (1, 2, '参加'), (1, 3, '参加'), (1, 4, '不参加'), (1, 5, '参加'),
  (2, 1, '参加'), (2, 2, '参加'), (2, 4, '参加'),
  (3, 1, '参加'), (3, 2, '参加'), (3, 3, '参加'), (3, 4, '参加'), (3, 5, '参加');

-- -------------------------------------------------------
-- practices
-- -------------------------------------------------------
INSERT INTO practices (practice_id, date, title, type, start, "end", location, comment) VALUES
  (1, (CURRENT_DATE + INTERVAL '3 day'),  '通常練習', 'practice', '19:00', '21:00', '公民館ホール', '天狗・ひょっとこ中心に。'),
  (2, (CURRENT_DATE + INTERVAL '7 day'),  '通常練習', 'practice', '19:00', '21:00', '公民館ホール', ''),
  (3, (CURRENT_DATE - INTERVAL '4 day'),  '通常練習', 'practice', '19:00', '21:00', '公民館ホール', '');
SELECT setval('practices_practice_id_seq', 3);

INSERT INTO answers_practices (practice_id, user_id, status) VALUES
  (1, 3, '欠席'), (1, 5, '遅刻'),
  (2, 4, '欠席'),
  (3, 2, '欠席');

-- -------------------------------------------------------
-- performances （春季例大祭）
-- -------------------------------------------------------
INSERT INTO performances (event_id, name, "order", roles) VALUES
  (1, '宮入り', '1', '{"天狗":"佐藤 健","ひょっとこ":"高橋 実"}'::jsonb),
  (1, '奉納舞', '2', '{"天狗":"山田 太郎","きつね":"鈴木 花子"}'::jsonb);

-- -------------------------------------------------------
-- otabi_places / otabi_schedules （お旅：訪問先と当日スケジュール）
-- -------------------------------------------------------
INSERT INTO otabi_places (place_id, name, address, tel, "group") VALUES
  (1, '獅子町 公民館', '獅子町1-1', '0000-00-0001', '上組'),
  (2, '田中商店',     '獅子町2-4', '0000-00-0002', '上組'),
  (3, '中央公園前',   '本町3-1',   '0000-00-0003', '下組'),
  (4, '駅前ロータリー', '駅前1-1',  '0000-00-0004', '下組');
SELECT setval('otabi_places_place_id_seq', 4);

INSERT INTO otabi_schedules (year, "group", day, no, time, place_id, place_name, donation, memo) VALUES
  (EXTRACT(YEAR FROM CURRENT_DATE)::text, '上組', '土曜', '1', '09:00', 1, '獅子町 公民館', 30000, ''),
  (EXTRACT(YEAR FROM CURRENT_DATE)::text, '上組', '土曜', '2', '09:40', 2, '田中商店',     10000, ''),
  (EXTRACT(YEAR FROM CURRENT_DATE)::text, '下組', '土曜', '1', '10:30', 3, '中央公園前',   20000, ''),
  (EXTRACT(YEAR FROM CURRENT_DATE)::text, '下組', '土曜', '2', '11:15', 4, '駅前ロータリー', 15000, '');

-- -------------------------------------------------------
-- gear （衣装）
-- -------------------------------------------------------
INSERT INTO member_gear (user_id, happi_no, tshirt_size, tekkou, hakama, kimono_top, kimono_bottom, memo) VALUES
  (1, '1',  'L',  '有', 'M', '紺',   '白', ''),
  (2, '2',  'M',  '有', 'S', '赤',   '白', ''),
  (4, '10', 'LL', '無', 'L', '紺',   '紺', '');

INSERT INTO gear_spare (item_type, value, quantity) VALUES
  ('Tシャツ', 'S', 5), ('Tシャツ', 'M', 8), ('Tシャツ', 'L', 6), ('手甲', '有', 12);

-- -------------------------------------------------------
-- game_scores （ゲームランキング）
-- -------------------------------------------------------
INSERT INTO game_scores (user_id, user_name, score) VALUES
  ('1', '山田 太郎', 2480),
  ('2', '鈴木 花子', 1920),
  ('4', '田中 一郎', 1340);

-- -------------------------------------------------------
-- settings
-- -------------------------------------------------------
INSERT INTO settings (key, value) VALUES ('haruWidgetVisible', 'true')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 完了
-- ログイン例:  ユーザー名「山田 太郎」/ パスワード「demo1234」（管理者）
--            ユーザー名「鈴木 花子」/ パスワード「demo1234」（一般）
