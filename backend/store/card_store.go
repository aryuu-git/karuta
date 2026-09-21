package store

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"

	"karuta/backend/model"
)

type CardStore struct {
	db *sql.DB
}

func NewCardStore(db *sql.DB) *CardStore {
	return &CardStore{db: db}
}

func (s *CardStore) CreateCard(ownerID int64, coverPath, displayText, series, tags string, isShared bool) (*model.Card, error) {
	res, err := s.db.Exec(
		`INSERT INTO cards (owner_id, cover_path, display_text, series, tags, is_shared, share_level, audio_path, hint_text)
		 VALUES (?, ?, ?, ?, ?, ?, 'playable', '', '')`,
		ownerID, coverPath, displayText, series, tags, true,
	)
	if err != nil {
		return nil, fmt.Errorf("create card: %w", err)
	}
	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

// CreateCardLegacy preserves the old interface for migration compatibility.
func (s *CardStore) CreateCardLegacy(deckID int64, audioPath, coverPath, hintText, displayText string, sortOrder int) (*model.Card, error) {
	res, err := s.db.Exec(
		`INSERT INTO cards (deck_id, audio_path, cover_path, hint_text, display_text, sort_order)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		deckID, audioPath, coverPath, hintText, displayText, sortOrder,
	)
	if err != nil {
		return nil, fmt.Errorf("create card legacy: %w", err)
	}
	id, _ := res.LastInsertId()
	return s.GetByID(id)
}

func (s *CardStore) GetByID(id int64) (*model.Card, error) {
	row := s.db.QueryRow(
		`SELECT c.id, COALESCE(c.deck_id, 0), COALESCE(c.owner_id, 0), c.audio_path, c.cover_path,
		        c.hint_text, c.display_text, c.series, c.tags, c.is_shared, COALESCE(c.share_level, 'private'), c.sort_order, c.created_at,
		        COALESCE(u.username, '') as owner_name
		 FROM cards c LEFT JOIN users u ON u.id = c.owner_id
		 WHERE c.id = ?`, id,
	)
	c := &model.Card{}
	if err := row.Scan(&c.ID, &c.DeckID, &c.OwnerID, &c.AudioPath, &c.CoverPath,
		&c.HintText, &c.DisplayText, &c.Series, &c.Tags, &c.IsShared, &c.ShareLevel, &c.SortOrder, &c.CreatedAt,
		&c.OwnerName); err != nil {
		return nil, fmt.Errorf("get card by id: %w", err)
	}
	return c, nil
}

// cardOrderBy 排序白名单（2026-09-21 牌库改版）：latest=最新创建、name=名称、
// plays=被抢次数（game_records 聚合）。未知值回退 latest。
func cardOrderBy(sort string) string {
	switch sort {
	case "name":
		return ` ORDER BY c.display_text ASC, c.id ASC`
	case "plays":
		return ` ORDER BY (SELECT COUNT(*) FROM game_records gr WHERE gr.card_id = c.id) DESC, c.created_at DESC`
	default:
		return ` ORDER BY c.created_at DESC`
	}
}

// appendCardTagFilter 标签精确 token 过滤片段（我的/公共两路共用，防语义漂移）：
// 逗号包围 + 去空格规范化 + %/_ 转义（2026-09-21 权限审查修复的语义）。
func appendCardTagFilter(query string, args []interface{}, tag string) (string, []interface{}) {
	if tag == "" {
		return query, args
	}
	normalized := strings.ReplaceAll(tag, " ", "")
	escaped := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(normalized)
	query += ` AND ',' || REPLACE(c.tags, ' ', '') || ',' LIKE ? ESCAPE '\'`
	return query, append(args, "%,"+escaped+",%")
}

// ListByOwner 我的牌库（分页 + 排序 + 关键词/标签服务端筛选 + 音频总时长聚合）
func (s *CardStore) ListByOwner(ownerID int64, sort, search, tag string, limit, offset int) ([]*model.Card, error) {
	query := `SELECT c.id, COALESCE(c.owner_id, 0), c.cover_path, c.display_text,
		        c.series, c.tags, c.is_shared, COALESCE(c.share_level, 'private'), c.created_at,
		        (SELECT COUNT(*) FROM card_audios ca WHERE ca.card_id = c.id) as audio_count,
		        COALESCE((SELECT SUM(ca.duration_sec) FROM card_audios ca WHERE ca.card_id = c.id), 0) as audio_duration,
		        (SELECT COUNT(*) FROM card_likes cl WHERE cl.card_id = c.id) as likes,
		        EXISTS(SELECT 1 FROM card_likes cl2 WHERE cl2.card_id = c.id AND cl2.user_id = ?) as liked_by_me
		 FROM cards c WHERE c.owner_id = ?`
	args := []interface{}{ownerID, ownerID}
	if search != "" {
		query += ` AND (c.display_text LIKE ? OR c.series LIKE ?)`
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	query, args = appendCardTagFilter(query, args, tag)
	query += cardOrderBy(sort) + ` LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list cards by owner: %w", err)
	}
	defer rows.Close()
	return s.scanCardList(rows)
}

func (s *CardStore) ListPublic(search, series, tag, owner, sort string, viewerID int64, limit, offset int) ([]*model.Card, error) {
	query := `SELECT c.id, COALESCE(c.owner_id, 0), c.cover_path, c.display_text,
	                 c.series, c.tags, c.is_shared, COALESCE(c.share_level, 'private'), c.created_at,
	                 (SELECT COUNT(*) FROM card_audios ca WHERE ca.card_id = c.id) as audio_count,
	                 COALESCE((SELECT SUM(ca.duration_sec) FROM card_audios ca WHERE ca.card_id = c.id), 0) as audio_duration,
	                 (SELECT COUNT(*) FROM card_likes cl WHERE cl.card_id = c.id) as likes,
	                 EXISTS(SELECT 1 FROM card_likes cl2 WHERE cl2.card_id = c.id AND cl2.user_id = ?) as liked_by_me,
	                 COALESCE(u.username, '') as owner_name
	          FROM cards c LEFT JOIN users u ON u.id = c.owner_id
	          WHERE c.share_level IN ('playable', 'editable')`
	args := []interface{}{viewerID}

	if search != "" {
		query += ` AND (c.display_text LIKE ? OR c.series LIKE ?)`
		args = append(args, "%"+search+"%", "%"+search+"%")
	}
	if series != "" {
		query += ` AND c.series = ?`
		args = append(args, series)
	}
	if tag != "" {
		// 精确 token 匹配（2026-09-21 修复）：逗号包围 + 去空格规范化 + 通配符转义。
		// 原 `tags LIKE '%tag%'` 两重缺陷：①子串误中（「游戏」命中「小游戏」）；
		// ②tag 中的 % / _ 未转义，tag=「%」可匹配全部卡片。
		query, args = appendCardTagFilter(query, args, tag)
	}
	if owner != "" {
		query += ` AND u.username LIKE ?`
		args = append(args, "%"+owner+"%")
	}

	query += cardOrderBy(sort) + ` LIMIT ? OFFSET ?`
	args = append(args, limit, offset)

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list public cards: %w", err)
	}
	defer rows.Close()
	return s.scanCardListWithOwner(rows)
}

func (s *CardStore) Update(id int64, displayText, series, tags string, isShared bool, shareLevel string) error {
	_, err := s.db.Exec(
		`UPDATE cards SET display_text = ?, series = ?, tags = ?, is_shared = ?, share_level = ? WHERE id = ?`,
		displayText, series, tags, isShared, shareLevel, id,
	)
	return err
}

func (s *CardStore) ListPublicTags() ([]string, error) {
	rows, err := s.db.Query(`SELECT DISTINCT c.tags FROM cards c WHERE c.share_level IN ('playable','editable') AND c.tags != ''`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tagSet := make(map[string]bool)
	for rows.Next() {
		var tags string
		rows.Scan(&tags)
		for _, t := range splitTags(tags) {
			if t != "" {
				tagSet[t] = true
			}
		}
	}
	result := make([]string, 0, len(tagSet))
	for t := range tagSet {
		result = append(result, t)
	}
	// 稳定排序（2026-09-21 修复）：map 迭代序随机，未排序导致前端标签行每次刷新跳动
	sort.Strings(result)
	return result, nil
}

func splitTags(s string) []string {
	var tags []string
	for _, t := range strings.Split(s, ",") {
		t = strings.TrimSpace(t)
		if t != "" {
			tags = append(tags, t)
		}
	}
	return tags
}

func (s *CardStore) BatchUpdateShareLevel(ids []int64, shareLevel string) error {
	if len(ids) == 0 {
		return nil
	}
	query := `UPDATE cards SET share_level = ?, is_shared = ? WHERE id IN (`
	isShared := shareLevel != "private"
	args := []interface{}{shareLevel, isShared}
	for i, id := range ids {
		if i > 0 {
			query += ","
		}
		query += "?"
		args = append(args, id)
	}
	query += ")"
	_, err := s.db.Exec(query, args...)
	return err
}

func (s *CardStore) UpdateCover(id int64, coverPath string) error {
	_, err := s.db.Exec(`UPDATE cards SET cover_path = ? WHERE id = ?`, coverPath, id)
	return err
}

// CountCoverPathReferences returns how many cards still reference a cover.
// Physical media must only be deleted after this reaches zero because cloned
// cards intentionally share the same underlying object.
func (s *CardStore) CountCoverPathReferences(coverPath string) (int, error) {
	var count int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM cards WHERE cover_path = ?`, coverPath).Scan(&count)
	return count, err
}

// DeleteCard 单事务删除卡及其全部引用（2026-09-21 修复：原四条独立 DELETE
// 中断会留半删态，如 game_records 已清而卡仍在）。
func (s *CardStore) DeleteCard(id int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, stmt := range []string{
		`DELETE FROM game_records WHERE card_id = ?`,
		`DELETE FROM deck_cards WHERE card_id = ?`,
		`DELETE FROM card_audios WHERE card_id = ?`,
		`DELETE FROM cards WHERE id = ?`,
	} {
		if _, err := tx.Exec(stmt, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ListByDeck is a legacy helper used by existing code paths.
func (s *CardStore) ListByDeck(deckID int64) ([]*model.Card, error) {
	rows, err := s.db.Query(
		`SELECT id, COALESCE(deck_id, 0), COALESCE(owner_id, 0), audio_path, cover_path, hint_text, display_text,
		        series, tags, is_shared, sort_order, created_at
		 FROM cards WHERE deck_id = ? ORDER BY sort_order ASC, id ASC`, deckID,
	)
	if err != nil {
		return nil, fmt.Errorf("list cards by deck: %w", err)
	}
	defer rows.Close()

	var cards []*model.Card
	for rows.Next() {
		c := &model.Card{}
		if err := rows.Scan(&c.ID, &c.DeckID, &c.OwnerID, &c.AudioPath, &c.CoverPath, &c.HintText, &c.DisplayText,
			&c.Series, &c.Tags, &c.IsShared, &c.SortOrder, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan card: %w", err)
		}
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

func (s *CardStore) scanCardList(rows *sql.Rows) ([]*model.Card, error) {
	var cards []*model.Card
	for rows.Next() {
		c := &model.Card{}
		var liked int
		if err := rows.Scan(&c.ID, &c.OwnerID, &c.CoverPath, &c.DisplayText,
			&c.Series, &c.Tags, &c.IsShared, &c.ShareLevel, &c.CreatedAt, &c.AudioCount, &c.AudioDuration,
			&c.Likes, &liked); err != nil {
			return nil, fmt.Errorf("scan card: %w", err)
		}
		c.LikedByMe = liked != 0
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

func (s *CardStore) scanCardListWithOwner(rows *sql.Rows) ([]*model.Card, error) {
	var cards []*model.Card
	for rows.Next() {
		c := &model.Card{}
		var liked int
		if err := rows.Scan(&c.ID, &c.OwnerID, &c.CoverPath, &c.DisplayText,
			&c.Series, &c.Tags, &c.IsShared, &c.ShareLevel, &c.CreatedAt, &c.AudioCount, &c.AudioDuration,
			&c.Likes, &liked, &c.OwnerName); err != nil {
			return nil, fmt.Errorf("scan card: %w", err)
		}
		c.LikedByMe = liked != 0
		cards = append(cards, c)
	}
	return cards, rows.Err()
}

// LikedByUser 该用户是否赞过此卡。
func (s *CardStore) LikedByUser(cardID, userID int64) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM card_likes WHERE card_id = ? AND user_id = ?`, cardID, userID).Scan(&n)
	return n > 0, err
}

// LikeToggle 点赞开关：INSERT OR IGNORE 命中=新点赞；冲突=已赞过则取消。
// 返回当前是否已赞。单条 SQL 语义串行（单连接），无并发窗口。
func (s *CardStore) LikeToggle(cardID, userID int64) (bool, error) {
	res, err := s.db.Exec(`INSERT OR IGNORE INTO card_likes (card_id, user_id) VALUES (?, ?)`, cardID, userID)
	if err != nil {
		return false, fmt.Errorf("like toggle: %w", err)
	}
	if affected, err := res.RowsAffected(); err == nil && affected == 1 {
		return true, nil
	}
	if _, err := s.db.Exec(`DELETE FROM card_likes WHERE card_id = ? AND user_id = ?`, cardID, userID); err != nil {
		return false, fmt.Errorf("unlike: %w", err)
	}
	return false, nil
}

// LikeCount 卡片当前点赞数（点赞端点响应用）。
func (s *CardStore) LikeCount(cardID int64) (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM card_likes WHERE card_id = ?`, cardID).Scan(&n)
	return n, err
}

// MergeTags 批量并入标签（读-合并-写；调用方负责 owner 校验）。已存在标签不重复。
func (s *CardStore) MergeTags(id int64, add []string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var cur string
	if err := tx.QueryRow(`SELECT COALESCE(tags, '') FROM cards WHERE id = ?`, id).Scan(&cur); err != nil {
		return err
	}
	existing := splitTags(cur)
	seen := make(map[string]bool, len(existing))
	for _, t := range existing {
		seen[t] = true
	}
	for _, t := range add {
		t = strings.TrimSpace(t)
		if t != "" && !seen[t] {
			existing = append(existing, t)
			seen[t] = true
		}
	}
	if _, err := tx.Exec(`UPDATE cards SET tags = ? WHERE id = ?`, strings.Join(existing, ","), id); err != nil {
		return err
	}
	return tx.Commit()
}
