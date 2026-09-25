# dailylab.app

오늘(Today) 앱 소개 사이트. Vercel 정적 배포(`public/`이 루트, 빌드 없음).

| 경로 | 파일 | 용도 | 색인 |
|------|------|------|------|
| `/` | `public/index.html` | 한국어 랜딩 | O |
| `/en` | `public/en/index.html` | 영어 랜딩 | O |
| `/ad` | `public/ad/index.html` | 광고 유입 전용 랜딩 (`?v=` 소재 매칭) | X (`noindex, follow`) |
| `/privacy`, `/terms` | `public/*.html` | 법적 고지 | O |
| `/hf/*` | HyperFrames 컴포지션 | 영상 원본(플레이어가 iframe으로 재생) | X |

## 영상 (HyperFrames)

영상은 [HyperFrames](https://hyperframes.heygen.com)로 만든 HTML 컴포지션이다. 사이트에서는 `<hyperframes-player>`로 HTML을 그대로 재생하고, 광고 매체 업로드·구조화 데이터용으로 MP4도 렌더해 `public/video/`에 둔다.

| 프로젝트 | 크기 | 길이 | 변수 |
|----------|------|------|------|
| `public/hf/promo` | 1920×1080 | 20s | `lang` (`ko`/`en`) |
| `public/hf/ad` | 1080×1920 | 15s | `lang`, `hook`, `hook2`, `cta` |
| `public/hf/og` | 1200×630 | 정지 | `lang` |

웹 플레이어에서는 같은 값을 쿼리로 넘긴다: `/hf/promo/?lang=en`, `/hf/ad/?hook=...&hook2=...`.

```bash
cd public/hf/promo
npx hyperframes lint                     # 구조 검사
npx hyperframes preview                  # Studio에서 편집
npx hyperframes snapshot --at 1,6,10,15  # 프레임 확인
npx hyperframes render --quality delivery --crf 26 -o ../../video/promo-ko.mp4
npx hyperframes render --quality delivery --crf 26 --variables '{"lang":"en"}' -o ../../video/promo-en.mp4
```

광고 소재 A/B (세로 9:16, Reels/Shorts/TikTok):

```bash
cd public/hf/ad
npx hyperframes render --quality delivery --crf 26 \
  --variables '{"hook":"잘 잔 날엔\n기분도 좋았을까?","hook2":"AI가 패턴을 찾아줘요 💡"}' \
  -o ../../video/ad-vertical-sleep.mp4
```

렌더된 소재 ↔ 랜딩 메시지 매칭:

| 영상 | 광고 링크 |
|------|-----------|
| `video/ad-vertical-ko.mp4` | `/ad?v=lonely&utm_source=...&utm_campaign=...` (기본값) |
| `video/ad-vertical-tired.mp4` | `/ad?v=tired&...` |
| `video/ad-vertical-sleep.mp4` | `/ad?v=sleep&...` |
| `video/ad-vertical-habit.mp4` | `/ad?v=habit&...` |

OG 이미지(`img/og-ko.jpg`, `img/og-en.jpg`)는 `hf/og`를 `npx hyperframes snapshot --at 0.5`로 찍어 JPG로 변환한 것이다.

**폰트**: 컴포지션은 영상에 쓰인 글자만 담은 Pretendard 서브셋(`assets/pretendard-hf.woff2`)을 쓴다. 문구를 바꾸면 새 글자가 시스템 폰트로 떨어지므로 서브셋을 다시 만든다:

```bash
pip install fonttools brotli
# chars.txt = 컴포지션·광고 페이지에 등장하는 모든 문자
pyftsubset PretendardVariable.woff2 --text-file=chars.txt --flavor=woff2 --layout-features='*' --output-file=pretendard-hf.woff2
```

## 광고 추적

`assets/site.js`가 `utm_*`, `gclid`, `fbclid`, `ttclid`를 세션에 저장하고 스토어 버튼 클릭 시 `store_click` 이벤트를 GA4(`gtag`)·Meta Pixel(`fbq`, Lead)·GTM(`dataLayer`) 중 설치된 곳으로 보낸다. App Store 링크에는 `ct=<utm_campaign>`이 붙는다(App Analytics 캠페인 측정은 `pt` 제공자 토큰 추가 필요). 태그 스니펫은 아직 없으니 광고 집행 전 `<head>`에 추가.

안드로이드 방문자는 CTA가 자동으로 비공개 베타(테스터 그룹) 링크로 바뀐다. 프로덕션 출시 후 `data-store="android"` 링크를 Play 스토어 URL로 교체.

## SEO 체크리스트 (배포 후 할 일)

- [ ] Google Search Console·네이버 서치어드바이저에 `https://www.dailylab.app` 등록 → `index.html` 주석의 인증 메타 채우기 → `sitemap.xml` 제출
- [ ] Vercel 도메인 설정에서 `dailylab.app` → `www.dailylab.app` 리다이렉트를 307 → **308(영구)** 로 변경
- [ ] [리치 결과 테스트](https://search.google.com/test/rich-results)로 FAQ·VideoObject·SoftwareApplication 확인
- [ ] 카카오톡 공유 캐시 초기화: [카카오 개발자 공유 디버거](https://developers.kakao.com/tool/debugger/sharing)
- [ ] 안드로이드 정식 출시 시 JSON-LD `operatingSystem`에 Android 추가, FAQ·CTA 문구 갱신
