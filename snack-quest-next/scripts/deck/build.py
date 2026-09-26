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
import hashlib
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
PUBLIC = HERE.parent.parent / 'public' / 'deck'
SITE = 'https://snackquests.shop'

BRAND = {'__LOGO__': 'logo.png', '__BOX__': 'box.webp'}

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
        'ttmetrics': "TikTok's analytics screen for @snackquests, 28 days to 25 August 2026: "
                     '177.8K post views, 4.7K profile views, 11.4K likes, 144 comments, 278 shares.',
        'ttprofile': 'The @snackquests TikTok profile: 1,208 followers, 13.7K likes, '
                     'and a grid of videos with 74K, 37.8K and 13.5K views.',
        'dm-a': 'An inbound direct message from a creator with 23,700 followers, '
                'asking about PR.',
        'dm-b': 'An inbound direct message from a creator with 1.2 million followers, '
                'asking for a chance to advertise Snack Quest on their page.',
        'dm-c': 'An inbound direct message from a creator with 31,700 followers, '
                'asking for prices and offering an advertising video.',
        'dm-d': 'An inbound direct message from a creator with 113,300 followers, '
                'suggesting they could work together.',
        'dm-e': 'A long inbound direct message from a creator with 172,100 followers, '
                'proposing a Snack Quest tasting and review video with their sister.',
        'dm-f': 'An inbound direct message from a verified food-review account '
                'offering a collaboration at no charge.',
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
        'ttmetrics': '@snackquests 的 TikTok 后台数据页，截至 2026 年 8 月 25 日的 28 天：'
                     '播放量 17.8 万，主页访问 4,700，点赞 1.14 万，评论 144，转发 278。',
        'ttprofile': '@snackquests 的 TikTok 主页：1,208 粉丝，13.7 万点赞，'
                     '视频列表中有 7.4 万、3.78 万与 1.35 万播放的作品。',
        'dm-a': '一位拥有 2.37 万粉丝的创作者主动发来私信，询问 PR 合作。',
        'dm-b': '一位拥有 120 万粉丝的创作者主动发来私信，希望在自己的主页上推广 Snack Quest。',
        'dm-c': '一位拥有 3.17 万粉丝的创作者主动发来私信，询问价格并提出可以拍摄推广视频。',
        'dm-d': '一位拥有 11.33 万粉丝的创作者主动发来私信，提出可以合作。',
        'dm-e': '一位拥有 17.21 万粉丝的创作者主动发来的长私信，提议和妹妹一起拍摄 Snack Quest 试吃测评视频。',
        'dm-f': '一个已认证的美食测评账号主动发来私信，提出免费合作。',
    },
}

LANGS = {
    'en': {
        'html_lang': 'en',
        'title': 'Snack Quest Investor Deck',
        'desc': 'Snack Quest is building the discovery and distribution layer international '
                'consumer brands use to reach African consumers. Raising KSh 8,000,000 to '
                'prove the network.',
        'social': 'The machine is the node. The network is the asset. Raising KSh 8,000,000 '
                  'to prove a distributed retail network, starting with snacks.',
        'canonical': f'{SITE}/deck',
        'other_href': '/deck/zh',
        'other_label': '中文',
        'other_title': 'Switch to Simplified Chinese',
        'fonts': 'family=Bagel+Fat+One&family=Geist:wght@400;500;600;700;800'
                 '&family=Geist+Mono:wght@400;500;600',
    },
    'zh': {
        'html_lang': 'zh-Hans',
        'title': 'Snack Quest 投资人介绍',
        'desc': 'Snack Quest 正在搭建国际消费品牌触达非洲消费者所需的发现与分销层。'
                '我们正在募集 KSh 800 万，用以验证这张网络。',
        'social': '机器是节点，网络才是资产。募集 KSh 800 万，从零食开始，验证一张分布式零售网络。',
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


SLOT_RE = re.compile(r'<div data-shot="(?P<key>[a-z-]+)" class="slot[^"]*">.*?</div>', re.S)


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
    if inline:
        body = body.replace('src="/deck/unboxing-clip.mp4"',
                            f'src="{SITE}/deck/unboxing-clip.mp4"')
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
        return sorted(re.findall(r'data-shot="([a-z-]+)"', b) +
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


STAMP_RE = re.compile(r'<!-- build-stamp:([0-9a-f]{64}) -->\n$')


def stamped(page: str) -> str:
    """Sign a generated page with the hash of its own contents."""
    return page + f'<!-- build-stamp:{hashlib.sha256(page.encode()).hexdigest()} -->\n'


def refuse_if_hand_edited(path: pathlib.Path, force: bool) -> None:
    """Never throw away an edit made to a generated file.

    Twice now the published deck has been edited directly — once when the
    raise changed, once when the whole thesis did — while `deck.src.html`
    stood still. Both times the source was left an entire funding round
    behind the page people were actually being sent, and a single run of
    this script would have reverted the live deck without a word.

    So every page written here carries a hash of itself. If the file on
    disk still matches its own stamp, this build produced it and may
    replace it. If the stamp is missing or stale, somebody edited the
    output by hand, and the edit is the newer work: the build stops and
    says so rather than overwriting it. `--force` is the way to say the
    source has since caught up and the output is meant to be replaced.
    """
    if not path.exists():
        return
    text = path.read_text()
    match = STAMP_RE.search(text)
    if match and hashlib.sha256(STAMP_RE.sub('', text).encode()).hexdigest() == match.group(1):
        return

    where = path.relative_to(PUBLIC.parent.parent) if PUBLIC.parent.parent in path.parents else path
    if force:
        print(f'--force: replacing hand-edited {where}')
        return
    raise SystemExit(
        f'REFUSING TO OVERWRITE: {where}\n'
        f'  {"Its build stamp does not match its contents" if match else "It carries no build stamp"},'
        ' so it was edited by hand after it was\n'
        '  generated. Building now would throw that edit away.\n\n'
        '  Fold the edit back into scripts/deck/deck.src.html (and\n'
        '  deck.zh.body.html for the Chinese), then re-run with --force.'
    )


def main() -> int:
    force = '--force' in sys.argv[1:]
    style, en_body = split_source()
    zh_body = (HERE / 'deck.zh.body.html').read_text()
    check_parity(en_body, zh_body)

    outputs = {
        'en': (PUBLIC / 'index.html', en_body),
        'zh': (PUBLIC / 'zh' / 'index.html', zh_body),
    }
    single_path = HERE / 'snack-quest-deck.html'

    # Every output is checked before any of them is written, so a refusal
    # leaves the set whole rather than half rebuilt.
    for path, _ in outputs.values():
        refuse_if_hand_edited(path, force)
    refuse_if_hand_edited(single_path, force)

    missing: list[str] = []
    for lang, (path, body) in outputs.items():
        page, gaps = compose(lang, body, style, inline=False)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(stamped(page))
        missing += gaps
        print(f'{lang:<3} {path.relative_to(PUBLIC.parent.parent)}  {len(page.encode()):>8,} bytes')

    # The single-file English copy, for publishing outside our own domain.
    single, _ = compose('en', en_body, style, inline=True)
    single_path.write_text(stamped(single))
    print(f'{"":<3} snack-quest-deck.html (inlined){len(single.encode()):>13,} bytes')

    if missing:
        print('STILL PLACEHOLDER:', ', '.join(sorted(set(missing))))
    else:
        print('every image embedded')
    return 0


if __name__ == '__main__':
    sys.exit(main())
