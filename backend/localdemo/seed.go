// Package localdemo creates an isolated development dataset without external media.
package localdemo

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/binary"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"

	"karuta/backend/media"

	"golang.org/x/crypto/bcrypt"
)

const (
	Username = "localdemo"
	Password = "localdemo123"
)

// Seed only initializes an empty database. Restarting never resets user edits.
func Seed(ctx context.Context, db *sql.DB, mediaSvc *media.Service) error {
	var users int
	if err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&users); err != nil {
		return err
	}
	if users != 0 {
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(Password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	names := []string{"春之声", "夏之声", "秋之声", "冬之声", "晨之声", "夜之声"}
	colors := []color.RGBA{
		{190, 91, 116, 255}, {62, 140, 132, 255}, {194, 136, 58, 255},
		{82, 127, 173, 255}, {155, 113, 178, 255}, {72, 80, 130, 255},
	}
	type sample struct{ cover, audio string }
	samples := make([]sample, len(names))
	// Write media before opening the transaction: the store uses one DB connection.
	for i := range names {
		cover, err := coverPNG(colors[i], i)
		if err != nil {
			return err
		}
		samples[i].cover, err = mediaSvc.Put(ctx, "cover", "covers", "png", "image/png", cover, 0)
		if err != nil {
			return err
		}
		samples[i].audio, err = mediaSvc.Put(ctx, "audio", "audio", "wav", "audio/wav", toneWAV(220+float64(i)*55), 0)
		if err != nil {
			return err
		}
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	insert := func(query string, args ...any) (int64, error) {
		res, err := tx.ExecContext(ctx, query, args...)
		if err != nil {
			return 0, err
		}
		return res.LastInsertId()
	}
	userID, err := insert(`INSERT INTO users(username, email, password, is_admin) VALUES (?, ?, ?, TRUE)`, Username, Username+"@karuta.local", string(hash))
	if err != nil {
		return err
	}
	deckID, err := insert(`INSERT INTO decks(owner_id, name, description) VALUES (?, ?, ?)`, userID, "本地测试牌组", "包含 6 张测试歌牌，可验收查看、返回、编辑和开局；音频为本地合成提示音。")
	if err != nil {
		return err
	}
	publicID, err := insert(`INSERT INTO decks(owner_id, name, description, is_public, share_level) VALUES (?, ?, ?, TRUE, 'playable')`, userID, "共享演示牌组", "用于验收公共牌组列表、收藏和复制。")
	if err != nil {
		return err
	}
	for i, sample := range samples {
		cardID, err := insert(`INSERT INTO cards(owner_id, cover_path, display_text, series, tags, is_shared, share_level) VALUES (?, ?, ?, ?, ?, TRUE, 'playable')`, userID, sample.cover, names[i], "本地演示", "本地测试,提示音")
		if err != nil {
			return err
		}
		if _, err := insert(`INSERT INTO card_audios(card_id, audio_path, hint_text, duration_sec) VALUES (?, ?, ?, 4)`, cardID, sample.audio, fmt.Sprintf("第 %d 张测试牌", i+1)); err != nil {
			return err
		}
		for _, id := range []int64{deckID, publicID} {
			if _, err := tx.ExecContext(ctx, `INSERT INTO deck_cards(deck_id, card_id, sort_order, added_by) VALUES (?, ?, ?, ?)`, id, cardID, i, userID); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE media_assets SET created_by = ? WHERE object_key IN (?, ?)`, userID, sample.cover, sample.audio); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func coverPNG(base color.RGBA, index int) ([]byte, error) {
	img := image.NewRGBA(image.Rect(0, 0, 192, 256))
	for y := 0; y < 256; y++ {
		for x := 0; x < 192; x++ {
			c := base
			if x < 8 || x >= 184 || y < 8 || y >= 248 || (x-96)*(x-96)+(y-105)*(y-105) < (30+index*4)*(30+index*4) {
				c = color.RGBA{239, 219, 169, 255}
			}
			img.SetRGBA(x, y, c)
		}
	}
	var out bytes.Buffer
	err := png.Encode(&out, img)
	return out.Bytes(), err
}

// Four seconds of mono PCM, with short fades to avoid clicks.
func toneWAV(frequency float64) []byte {
	const rate, frames = 16000, 4 * 16000
	data := make([]byte, 44+frames*2)
	copy(data, "RIFF")
	binary.LittleEndian.PutUint32(data[4:], uint32(len(data)-8))
	copy(data[8:], "WAVEfmt ")
	binary.LittleEndian.PutUint32(data[16:], 16)
	binary.LittleEndian.PutUint16(data[20:], 1)
	binary.LittleEndian.PutUint16(data[22:], 1)
	binary.LittleEndian.PutUint32(data[24:], rate)
	binary.LittleEndian.PutUint32(data[28:], rate*2)
	binary.LittleEndian.PutUint16(data[32:], 2)
	binary.LittleEndian.PutUint16(data[34:], 16)
	copy(data[36:], "data")
	binary.LittleEndian.PutUint32(data[40:], frames*2)
	for i := 0; i < frames; i++ {
		fade := math.Min(1, math.Min(float64(i)/800, float64(frames-1-i)/800))
		value := int16(5000 * fade * math.Sin(2*math.Pi*frequency*float64(i)/rate))
		binary.LittleEndian.PutUint16(data[44+i*2:], uint16(value))
	}
	return data
}
