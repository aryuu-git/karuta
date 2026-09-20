package storage

import "testing"

func TestMediaURLRewrite(t *testing.T) {
	SetMediaBaseURL("")
	defer SetMediaBaseURL("")

	if got := FileURL("covers/abc.jpg", "covers"); got != "/uploads/covers/abc.jpg" {
		t.Fatalf("relative mode FileURL = %q", got)
	}
	if got := MediaURL("/uploads/ccp/x.png"); got != "/uploads/ccp/x.png" {
		t.Fatalf("relative mode MediaURL = %q", got)
	}

	SetMediaBaseURL("https://bucket.cos.ap-shanghai.myqcloud.com/")
	if got := FileURL("covers/abc.jpg", "covers"); got != "https://bucket.cos.ap-shanghai.myqcloud.com/covers/abc.jpg" {
		t.Fatalf("absolute mode FileURL = %q", got)
	}
	if got := MediaURL("/uploads/ccp/x.png"); got != "https://bucket.cos.ap-shanghai.myqcloud.com/ccp/x.png" {
		t.Fatalf("absolute mode MediaURL = %q", got)
	}
	if got := MediaURL(""); got != "" {
		t.Fatalf("empty URL = %q", got)
	}
}
