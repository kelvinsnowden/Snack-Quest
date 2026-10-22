"""Build the full-detail investor deck from its source.

This is the working behind the 11-slide pitch that people are actually
sent (`public/deck/index.html`, hand-written, styled by
`public/deck/pitch.css`). It is for the investor who asks for more after
the meeting.

Two things are produced:

  * `public/deck/full/index.html`  — served at /deck/full
  * `snack-quest-deck.html`        — single-file, for publishing outside
                                     our own domain

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

# Alt text per image. Written out rather than derived from the caption:
# a screen reader should hear what is in the picture, not the commercial
# claim the caption makes about it.
SHOT_ALT = {
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
    'machines': 'Kelvin Kimathi, founder of Snack Quest, standing in front of the '
                'partner vending machines Snack Quest stocks and manages.',
}

META = {
    'title': 'Snack Quest Investor Deck: Full Detail',
    'desc': 'Snack Quest is building the discovery and distribution layer international '
            'consumer brands use to reach African consumers. Raising KSh 10,000,000 to '
            'prove the network.',
    'social': 'The machine is the node. The network is the asset. Raising KSh 10,000,000 '
              'to prove a distributed retail network, starting with snacks.',
    'canonical': f'{SITE}/deck/full',
    'fonts': 'family=Bagel+Fat+One&family=Geist:wght@400;500;600;700;800'
             '&family=Geist+Mono:wght@400;500;600',
}

def data_uri(name: str) -> str:
    raw = (PUBLIC / name).read_bytes()
    ext = name.rsplit('.', 1)[1]
    mime = {'png': 'image/png', 'webp': 'image/webp', 'jpg': 'image/jpeg'}[ext]
    return f'data:{mime};base64,' + base64.b64encode(raw).decode()


SLOT_RE = re.compile(r'<div data-shot="(?P<key>[a-z-]+)" class="slot[^"]*">.*?</div>', re.S)


def put_shots(html: str, inline: bool) -> tuple[str, list[str]]:
    """Replace a slot with its image, where the file exists."""
    missing = []

    def swap(match: re.Match) -> str:
        key = match.group('key')
        path = PUBLIC / f'shot-{key}.webp'
        if not path.exists():
            missing.append(key)
            return match.group(0)
        src = data_uri(path.name) if inline else f'/deck/{path.name}'
        return f'<img src="{src}" alt="{SHOT_ALT[key]}">'

    return SLOT_RE.sub(swap, html), missing


def split_source() -> tuple[str, str]:
    """The source carries the stylesheet as well as the slides."""
    src = (HERE / 'deck.src.html').read_text()
    style = src[src.index('<style>'):src.index('</style>') + len('</style>')]
    body = src[src.index('<div class="deck">'):]
    return style, body


def deckbar() -> str:
    """The way back to the 11-slide pitch, which is what most readers want."""
    return '\n  <nav class="deckbar" aria-label="Deck links"><a href="/deck">11-slide pitch</a></nav>\n'


def compose(body: str, style: str, inline: bool) -> tuple[str, list[str]]:
    meta = META
    for token, name in BRAND.items():
        body = body.replace(token, data_uri(name) if inline else f'/deck/{name}')
    for token in BRAND:
        assert token not in body, token
    if inline:
        body = body.replace('src="/deck/unboxing-clip.mp4"',
                            f'src="{SITE}/deck/unboxing-clip.mp4"')
    body, missing = put_shots(body, inline)
    body = body.replace('<div class="deck">', '<div class="deck">' + deckbar(), 1)

    # Asset paths and links are absolute (/deck/...): the page lives in
    # /deck/full, below the folder the assets sit in.
    head = f'''<!doctype html>
<html lang="en">
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
        '  Fold the edit back into scripts/deck/deck.src.html,\n'
        '  then re-run with --force.'
    )


def main() -> int:
    force = '--force' in sys.argv[1:]
    style, body = split_source()
    path = PUBLIC / 'full' / 'index.html'
    single_path = HERE / 'snack-quest-deck.html'

    # Both outputs are checked before either is written, so a refusal
    # leaves the pair whole rather than half rebuilt.
    refuse_if_hand_edited(path, force)
    refuse_if_hand_edited(single_path, force)

    page, missing = compose(body, style, inline=False)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(stamped(page))
    print(f'{path.relative_to(PUBLIC.parent.parent)}  {len(page.encode()):>8,} bytes')

    # The single-file copy, for publishing outside our own domain.
    single, _ = compose(body, style, inline=True)
    single_path.write_text(stamped(single))
    print(f'snack-quest-deck.html (inlined)  {len(single.encode()):>8,} bytes')

    if missing:
        print('STILL PLACEHOLDER:', ', '.join(sorted(set(missing))))
    else:
        print('every image embedded')
    return 0

if __name__ == '__main__':
    sys.exit(main())
