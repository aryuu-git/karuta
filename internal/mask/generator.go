package mask

import "math/rand"

// CardMask 描述一张牌的遮罩效果参数
type CardMask struct {
	Type      string  `json:"type"`
	Direction string  `json:"direction,omitempty"`
	Ratio     float64 `json:"ratio,omitempty"`
	Intensity float64 `json:"intensity,omitempty"`
	Cx        float64 `json:"cx,omitempty"`
	Cy        float64 `json:"cy,omitempty"`
	Radius    float64 `json:"radius,omitempty"`
	Angle     float64 `json:"angle,omitempty"`
	Width     float64 `json:"width,omitempty"`
}

// GenerateMasks 为一组牌面生成确定性遮罩参数
// 使用 room seed XOR cardID 作为每张牌的独立种子，保证所有玩家看到完全一致的遮罩
func GenerateMasks(seed int64, cardIDs []int64, difficulty string) map[int64]*CardMask {
	masks := make(map[int64]*CardMask, len(cardIDs))
	for _, id := range cardIDs {
		rng := rand.New(rand.NewSource(seed ^ id))
		masks[id] = generateOne(rng, difficulty)
	}
	return masks
}

func generateOne(rng *rand.Rand, difficulty string) *CardMask {
	switch difficulty {
	case "easy":
		return generateEasy(rng)
	case "hard":
		return generateHard(rng)
	default:
		return generateNormal(rng)
	}
}

// easy: clip-edge 或 stripe, ratio 0.2-0.3, 无模糊
func generateEasy(rng *rand.Rand) *CardMask {
	types := []string{"clip-edge", "stripe"}
	chosen := types[rng.Intn(len(types))]

	switch chosen {
	case "clip-edge":
		dirs := []string{"top", "bottom", "left", "right"}
		return &CardMask{
			Type:      "clip-edge",
			Direction: dirs[rng.Intn(len(dirs))],
			Ratio:     0.2 + rng.Float64()*0.1, // 0.2-0.3
		}
	case "stripe":
		return &CardMask{
			Type:  "stripe",
			Angle: float64(rng.Intn(180)),
			Width: 0.08 + rng.Float64()*0.04, // 条纹宽度 8%-12%
		}
	}
	return &CardMask{Type: "clip-edge", Direction: "top", Ratio: 0.25}
}

// normal: clip-edge/clip-diagonal/blur/stripe, ratio 0.4-0.55, blur 0-2px
func generateNormal(rng *rand.Rand) *CardMask {
	types := []string{"clip-edge", "clip-diagonal", "blur", "stripe"}
	chosen := types[rng.Intn(len(types))]

	switch chosen {
	case "clip-edge":
		dirs := []string{"top", "bottom", "left", "right"}
		return &CardMask{
			Type:      "clip-edge",
			Direction: dirs[rng.Intn(len(dirs))],
			Ratio:     0.4 + rng.Float64()*0.15, // 0.4-0.55
		}
	case "clip-diagonal":
		dirs := []string{"top-left", "top-right", "bottom-left", "bottom-right"}
		return &CardMask{
			Type:      "clip-diagonal",
			Direction: dirs[rng.Intn(len(dirs))],
			Ratio:     0.4 + rng.Float64()*0.15,
		}
	case "blur":
		return &CardMask{
			Type:      "blur",
			Intensity: rng.Float64() * 2, // 0-2px
		}
	case "stripe":
		return &CardMask{
			Type:  "stripe",
			Angle: float64(rng.Intn(180)),
			Width: 0.06 + rng.Float64()*0.06, // 条纹宽度 6%-12%
		}
	}
	return &CardMask{Type: "blur", Intensity: 1.5}
}

// hard: clip-diagonal/blur/pixelate/spotlight, ratio 0.6-0.8, blur 2-5px
func generateHard(rng *rand.Rand) *CardMask {
	types := []string{"clip-diagonal", "blur", "pixelate", "spotlight"}
	chosen := types[rng.Intn(len(types))]

	switch chosen {
	case "clip-diagonal":
		dirs := []string{"top-left", "top-right", "bottom-left", "bottom-right"}
		return &CardMask{
			Type:      "clip-diagonal",
			Direction: dirs[rng.Intn(len(dirs))],
			Ratio:     0.6 + rng.Float64()*0.2, // 0.6-0.8
		}
	case "blur":
		return &CardMask{
			Type:      "blur",
			Intensity: 2 + rng.Float64()*3, // 2-5px
		}
	case "pixelate":
		return &CardMask{
			Type:      "pixelate",
			Intensity: 8 + rng.Float64()*12, // 块大小 8-20px
		}
	case "spotlight":
		return &CardMask{
			Type:   "spotlight",
			Cx:     0.2 + rng.Float64()*0.6, // 圆心 x: 0.2-0.8
			Cy:     0.2 + rng.Float64()*0.6, // 圆心 y: 0.2-0.8
			Radius: 0.1 + rng.Float64()*0.15, // 半径: 0.1-0.25（只露一小块）
		}
	}
	return &CardMask{Type: "blur", Intensity: 3}
}
