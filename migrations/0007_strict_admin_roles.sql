-- Only the two approved administrators may keep the admin role.
-- Fang can have legacy/new LIFF UIDs during the identity transition, but must
-- still match Fang's profile data. Yang must match Yang's profile data.
UPDATE users
SET role = 'user'
WHERE role = 'admin'
  AND NOT (
    (
      line_id IN ('Uf729764dbb5b652a5a90a467320bea29', 'U050397a077bef628b317b0bbedeb2187')
      AND (name LIKE '%方萬隆%' OR name LIKE '%Tonyfang%' OR phone = '0927136847')
    )
    OR
    (
      line_id IN ('U58eb5c1a747450140ce1335af709ae55', 'Ue9a59cf9b2969ec78b6bfdc2a4cfca08')
      AND (name LIKE '%楊滄棋%' OR phone = '0986919171')
    )
  );
