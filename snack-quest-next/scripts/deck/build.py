"""Build both copies of the investor deck from one source.

`deck.src.html` is the single source. Two things differ between the copy
published as an Artifact and the copy served from snackquests.shop/deck:

  * images — the Artifact is a single self-contained file, so its images
    are inlined as data URIs; the site version references real files
    under `public/deck/`, which the CDN serves and the browser caches.
  * the document skeleton — the Artifact host supplies `<!doctype>`,
    `<head>` and `<body>`; on our own domain we write them ourselves,
    with the OG tags and the `noindex` the shared link needs.

The store renders and the operations photographs are swapped in only if
their files exist, so this is safe to run before they arrive: a missing
image stays a loud dashed slot rather than becoming a broken image.
Drop a file at `public/deck/shot-<key>.webp` and re-run.
"""

import base64
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).resolve().parent
PUBLIC = HERE.parent.parent / 'public' / 'deck'
SITE = 'https://snackquests.shop'

BRAND = {'__LOGO__': 'logo.png', '__BOX__': 'box.webp', '__UNBOX__': 'unboxing.webp'}

# Alt text per image. Written out rather than derived from the caption:
# a screen reader should hear what is in the picture, not the commercial
# claim the caption is making about it.
SHOT_ALT = {
    # The store concept renders (slide 05).
    'interior': 'The Snack Quest store interior: country-labelled snack walls, '
                'the Build Your Quest pick wall, a mystery box table and a seating corner.',
    'front': 'The Snack Quest storefront at night, lit signage on a corner unit.',
    'aisles': 'Snack walls labelled Korea, Japan, China and Thailand, customers browsing.',
    'pickwall': 'The Build Your Quest wall: open bins of snacks under a Pick 5 sign.',
    'counter': 'The store entrance and the lit checkout counter.',
    # Photographs of the operation as it runs today (slide 03).
    'rider': 'A delivery rider riding away down a Nairobi side road with three '
             'Snack Quest branded boxes strapped to the back of the motorbike.',
    'dispatch': 'A delivery rider in a hi-vis vest standing beside his motorbike, '
                'securing three stacked Snack Quest branded boxes.',
    # The founder, on the ask slide.
    'founder': 'Kelvin Kimathi, founder of Snack Quest, seated at a counter '
               'beside an open Snack Quest box packed with snacks.',
}


def data_uri(name: str) -> str:
    raw = (PUBLIC / name).read_bytes()
    ext = name.rsplit('.', 1)[1]
    mime = {'png': 'image/png', 'webp': 'image/webp', 'jpg': 'image/jpeg'}[ext]
    return f'data:{mime};base64,' + base64.b64encode(raw).decode()


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

    # Non-greedy to the slot's own closing tag; the slots contain no
    # nested divs, which is what makes this safe.
    pattern = re.compile(
        r'<div data-shot="(?P<key>[a-z]+)" class="slot[^"]*">.*?</div>', re.S
    )
    return pattern.sub(swap, html), missing


def build(inline: bool) -> tuple[str, list[str]]:
    html = (HERE / 'deck.src.html').read_text()
    for token, name in BRAND.items():
        html = html.replace(token, data_uri(name) if inline else f'/deck/{name}')
    html, missing = put_shots(html, inline)
    for token in BRAND:
        assert token not in html, token
    return html, missing


def wrap_for_site(inner: str) -> str:
    inner = inner.replace('<title>Snack Quest Investor Deck</title>\n', '')
    head, body = inner.split('<div class="deck">', 1)
    body = '<div class="deck">' + body
    desc = ('Snack Quest is building the home of global snack discovery in Africa. '
            'This deck sets out the case for our first physical location in Nairobi.')
    social = ('The home of global snack discovery in Africa. '
              'The case for our first physical location in Nairobi.')
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Snack Quest — Investor Deck</title>
<meta name="description" content="{desc}">

<!--
  Not for search results. This is a document we hand to specific people,
  not a page we want surfaced under "snack quest nairobi" — and once the
  funding figures on the use-of-funds slide are filled in, indexing it
  would publish them. Deliberately NOT a robots.txt Disallow: robots.txt
  is itself public, so listing the path there advertises the URL it is
  meant to keep quiet. `noindex` (here and as an X-Robots-Tag header in
  next.config.ts) tells the crawler not to keep the page after fetching
  it, which is the behaviour actually wanted.
-->
<meta name="robots" content="noindex, nofollow">

<link rel="canonical" href="{SITE}/deck">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Snack Quest">
<meta property="og:title" content="Snack Quest — Investor Deck">
<meta property="og:description" content="{social}">
<meta property="og:url" content="{SITE}/deck">
<meta property="og:image" content="{SITE}/deck/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Snack Quest — Investor Deck">
<meta name="twitter:description" content="{social}">
<meta name="twitter:image" content="{SITE}/deck/og.jpg">

<link rel="icon" href="/deck/logo.png" type="image/png">
<meta name="theme-color" content="#f4f2fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#17140f" media="(prefers-color-scheme: dark)">

{head.strip()}
</head>
<body>
{body.strip()}
</body>
</html>
'''


def main() -> int:
    # The single-file copy, for publishing outside our own domain.
    artifact, missing = build(inline=True)
    (HERE / 'snack-quest-deck.html').write_text(artifact)

    site, _ = build(inline=False)
    site = wrap_for_site(site)
    (PUBLIC / 'index.html').write_text(site)

    print(f'artifact  {len(artifact.encode()):>9,} bytes')
    print(f'site      {len(site.encode()):>9,} bytes')
    if missing:
        print('STILL PLACEHOLDER:', ', '.join(missing))
    else:
        print('every image embedded')
    return 0


if __name__ == '__main__':
    sys.exit(main())
