"""Build every copy of the investor deck from one set of sources.

Three things are produced:

  * `public/deck/index.html`     — English, served at /deck
  * `public/deck/zh/index.html`  — Simplified Chinese, served at /deck/zh
  * `snack-quest-deck.html`      — English, single-file, for publishing
                                   outside our own domain

The two languages are separate documents rather than one page that
switches, because this is a document people email to each other. A URL
that opens in the reader's language needs no interaction and survives
being forwarded; a JavaScript toggle does neither.

They share the stylesheet, which lives in the English source and is
lifted out at build time — one copy, so a design change cannot land in
one language and not the other. What they do not share is prose: the
Chinese is written, not mirrored, because a literal rendering of lines
like "what it does not have is a front door" is not an argument in any
language. `check_parity` is what stops them drifting structurally.

Images are swapped in only where the file exists, so this is safe to
run with any of them missing: the slot stays a loud dashed box rather
than becoming a broken image. Drop a file at
`public/deck/shot-<key>.webp` and re-run.
"""

import base64
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
PUBLIC = HERE.parent.parent / 'public' / 'deck'
SITE = 'https://snackquests.shop'

BRAND = {'__LOGO__': 'logo.png', '__BOX__': 'box.webp', '__UNBOX__': 'unboxing.webp'}

# Alt text per image, per language. Written out rather than derived from
# the caption: a screen reader should hear what is in the picture, not
# the commercial claim the caption makes about it.
SHOT_ALT = {
    'en': {
        'interior': 'The Snack Quest store interior: country-labelled snack walls, '
                    'the Build Your Quest pick wall, a mystery box table and a seating corner.',
        'front': 'The Snack Quest storefront at night, lit signage on a corner unit.',
        'aisles': 'Snack walls labelled Korea, Japan, China and Thailand, customers browsing.',
        'pickwall': 'The Build Your Quest wall: open bins of snacks under a Pick 5 sign.',
        'counter': 'The store entrance and the lit checkout counter.',
        'rider': 'A delivery rider riding away down a Nairobi side road with three '
                 'Snack Quest branded boxes strapped to the back of the motorbike.',
        'dispatch': 'A delivery rider in a hi-vis vest standing beside his motorbike, '
                    'securing three stacked Snack Quest branded boxes.',
        'founder': 'Kelvin Kimathi, founder of Snack Quest, seated at a counter '
                   'beside an open Snack Quest box packed with snacks.',
    },
    'zh': {
        'interior': 'Snack Quest 门店内景：按国别陈列的零食墙、“自选盲盒”自选墙、盲盒陈列台与休息区。',
        'front': 'Snack Quest 街角门店夜景，招牌亮灯。',
        'aisles': '按韩国、日本、中国、泰国分区的零食墙，顾客正在挑选。',
        'pickwall': '“自选盲盒”自选墙：“任选 5 款”标识下的开放式零食格。',
        'counter': '门店入口与亮灯的收银台。',
        'rider': '配送骑手骑车驶离内罗毕小路，车后绑着三个 Snack Quest 品牌包装箱。',
        'dispatch': '身穿反光背心的配送骑手站在摩托车旁，固定三个叠放的 Snack Quest 品牌包装箱。',
        'founder': 'Snack Quest 创始人 Kelvin Kimathi 坐在台前，身旁是一个装满零食的 Snack Quest 敞口礼盒。',
    },
}

LANGS = {
    'en': {
        'html_lang': 'en',
        'title': 'Snack Quest — Investor Deck',
        'desc': 'Snack Quest is building the home of global snack discovery in Africa. '
                'This deck sets out the case for our first physical location in Nairobi.',
        'social': 'The home of global snack discovery in Africa. '
                  'The case for our first physical location in Nairobi.',
        'canonical': f'{SITE}/deck',
        'other_href': '/deck/zh',
        'other_label': '中文',
        'other_title': 'Switch to Simplified Chinese',
        'fonts': 'family=Bagel+Fat+One&family=Geist:wght@400;500;600;700;800'
                 '&family=Geist+Mono:wght@400;500;600',
    },
    'zh': {
        'html_lang': 'zh-Hans',
        'title': 'Snack Quest — 投资人介绍',
        'desc': 'Snack Quest 正在把非洲打造成全球零食探索的目的地。本文件阐述我们在内罗毕开设首家实体门店的投资逻辑。',
        'social': '全球零食探索在非洲的目的地。内罗毕首家实体门店的投资逻辑。',
        'canonical': f'{SITE}/deck/zh',
        'other_href': '/deck',
        'other_label': 'EN',
        'other_title': '切换到英文',
        # Noto Sans SC carries the Chinese; Geist has no CJK glyphs at all,
        # so without this the whole document falls back to a system font
        # and the type design goes with it.
        'fonts': 'family=Bagel+Fat+One&family=Geist:wght@400;500;600;700;800'
                 '&family=Geist+Mono:wght@400;500;600'
                 '&family=Noto+Sans+SC:wght@400;500;700;900',
    },
}


def data_uri(name: str) -> str:
    raw = (PUBLIC / name).read_bytes()
    ext = name.rsplit('.', 1)[1]
    mime = {'png': 'image/png', 'webp': 'image/webp', 'jpg': 'image/jpeg'}[ext]
    return f'data:{mime};base64,' + base64.b64encode(raw).decode()


SLOT_RE = re.compile(r'<div data-shot="(?P<key>[a-z]+)" class="slot[^"]*">.*?</div>', re.S)


def put_shots(html: str, lang: str, inline: bool) -> tuple[str, list[str]]:
    """Replace a slot with its image, where the file exists."""
    missing = []

    def swap(match: re.Match) -> str:
        key = match.group('key')
        path = PUBLIC / f'shot-{key}.webp'
        if not path.exists():
            missing.append(key)
            return match.group(0)
        src = data_uri(path.name) if inline else f'/deck/{path.name}'
        return f'<img src="{src}" alt="{SHOT_ALT[lang][key]}">'

    return SLOT_RE.sub(swap, html), missing


def split_source() -> tuple[str, str]:
    """The English source carries the stylesheet for both languages."""
    src = (HERE / 'deck.src.html').read_text()
    style = src[src.index('<style>'):src.index('</style>') + len('</style>')]
    body = src[src.index('<div class="deck">'):]
    return style, body


def langbar(lang: str) -> str:
    """Injected at build time so the link exists in both without being
    written — and maintained — twice."""
    meta = LANGS[lang]
    return (
        f'\n  <nav class="langbar" aria-label="Language">'
        f'<a href="{meta["other_href"]}" hreflang="{"zh-Hans" if lang == "en" else "en"}" '
        f'title="{meta["other_title"]}">{meta["other_label"]}</a></nav>\n'
    )


def compose(lang: str, body: str, style: str, inline: bool) -> tuple[str, list[str]]:
    meta = LANGS[lang]
    for token, name in BRAND.items():
        body = body.replace(token, data_uri(name) if inline else f'/deck/{name}')
    for token in BRAND:
        assert token not in body, token
    body, missing = put_shots(body, lang, inline)
    body = body.replace('<div class="deck">', '<div class="deck">' + langbar(lang), 1)

    # Relative asset paths only resolve from /deck; the Chinese page is a
    # directory deeper, and its own links are absolute for the same reason.
    other = LANGS['zh' if lang == 'en' else 'en']
    head = f'''<!doctype html>
<html lang="{meta['html_lang']}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{meta['title']}</title>
<meta name="description" content="{meta['desc']}">

<!--
  Not for search results. This is a document we hand to specific people,
  not a page we want surfaced under "snack quest nairobi", and it now
  carries the actual funding figures. Deliberately NOT a robots.txt
  Disallow: robots.txt is itself public, so listing the path there
  advertises the URL it is meant to keep quiet. `noindex` (here and as
  an X-Robots-Tag header in next.config.ts) tells the crawler not to
  keep the page after fetching it, which is the behaviour wanted.
-->
<meta name="robots" content="noindex, nofollow">

<link rel="canonical" href="{meta['canonical']}">
<link rel="alternate" hreflang="{other['html_lang']}" href="{other['canonical']}">
<link rel="alternate" hreflang="{meta['html_lang']}" href="{meta['canonical']}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Snack Quest">
<meta property="og:title" content="{meta['title']}">
<meta property="og:description" content="{meta['social']}">
<meta property="og:url" content="{meta['canonical']}">
<meta property="og:image" content="{SITE}/deck/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{meta['title']}">
<meta name="twitter:description" content="{meta['social']}">
<meta name="twitter:image" content="{SITE}/deck/og.jpg">

<link rel="icon" href="/deck/logo.png" type="image/png">
<meta name="theme-color" content="#f4f2fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#17140f" media="(prefers-color-scheme: dark)">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?{meta['fonts']}&display=swap">

{style}
</head>
<body>
{body.strip()}
</body>
</html>
'''
    return head, missing


def check_parity(en_body: str, zh_body: str) -> None:
    """The two decks must stay the same deck.

    Prose is free to differ — that is the point of writing rather than
    translating — but a slide added to one and not the other, or an
    image slot that exists in only one, is drift rather than voice.
    """
    def slides(b: str) -> int:
        return len(re.findall(r'<section class="slide', b))

    def shots(b: str) -> list[str]:
        return sorted(re.findall(r'data-shot="([a-z]+)"', b) +
                      re.findall(r'__(LOGO|BOX|UNBOX)__', b))

    if slides(en_body) != slides(zh_body):
        raise SystemExit(
            f'PARITY: {slides(en_body)} English slides vs {slides(zh_body)} Chinese. '
            'A slide was added to one deck and not the other.'
        )
    if shots(en_body) != shots(zh_body):
        raise SystemExit(
            f'PARITY: image slots differ.\n  en: {shots(en_body)}\n  zh: {shots(zh_body)}'
        )


def main() -> int:
    style, en_body = split_source()
    zh_body = (HERE / 'deck.zh.body.html').read_text()
    check_parity(en_body, zh_body)

    outputs = {
        'en': (PUBLIC / 'index.html', en_body),
        'zh': (PUBLIC / 'zh' / 'index.html', zh_body),
    }
    missing: list[str] = []
    for lang, (path, body) in outputs.items():
        page, gaps = compose(lang, body, style, inline=False)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(page)
        missing += gaps
        print(f'{lang:<3} {path.relative_to(PUBLIC.parent.parent)}  {len(page.encode()):>8,} bytes')

    # The single-file English copy, for publishing outside our own domain.
    single, _ = compose('en', en_body, style, inline=True)
    (HERE / 'snack-quest-deck.html').write_text(single)
    print(f'{"":<3} snack-quest-deck.html (inlined){len(single.encode()):>13,} bytes')

    if missing:
        print('STILL PLACEHOLDER:', ', '.join(sorted(set(missing))))
    else:
        print('every image embedded')
    return 0


if __name__ == '__main__':
    sys.exit(main())
