# Snack Quest — Founding Partner Package: Image Asset List

Audit of `snack-quest-founding-partner-package.mp4` (60s, 9:16) and the image assets needed to rebuild it as one coherent, premium campaign.

**Status:** prompts only. Nothing has been generated yet.

---

## Part 1 — Audit of the current video

| Time | Current visual | Problem | Fix |
|---|---|---|---|
| 0–5.4s | Hook text over flashes of storyboard crops (dashboard, fleet list, sourcing) | Flashes are ~300px crops blown up; soft and noisy; dashboard has baked-in fake numbers | Replace with A05, A08, A09, A11, A13, A17 at full resolution |
| 5.4–9s | Puzzled man with chalk-board question bubbles | Low-res crop; baked-in hand-drawn text clashes with the editor's clean question tags; it is not clear he is looking at a *machine* | A03: clean, sharp problem shot with an empty generic machine and negative space for overlays |
| 9–9.8s | Purple "sticker" logo tile | Off-brand versus the machine's white/orange wordmark; looks like a different company | A02: clean wordmark matching the machine wrap |
| 9.8–13.6s | Machine card next to text chain | Strong photo, but it is the same shot used everywhere, so it loses impact | A04: dedicated hero in an aspirational Nairobi lobby |
| 13.6–23s | "Included" stack: machine / sourcing / warehouse / restocking / dashboard / van | Sourcing and restocking are low-res crops with third-party brand logos (Takis, Lay's); van shot is soft | A07, A08, A09, A10, A12 |
| 23–30s | Phone with built-in UI over a blurred lounge | UI is good, but there is no *person*, so the "dream outcome" has no protagonist | A13 (investor) + A12 phone/laptop device plates |
| 30–33.4s | 20 copies of one machine thumbnail | Reads as clip-art, not as a real fleet across real places | A14 fleet tiles: the same machine in four distinct locations |
| 33.4–45s | Location grid of 300px collage tiles; "Factories" is just a word | Soft images; inconsistent machine renderings; no factory or petrol station photo of quality | A15-series location set (8 images) + A16 assessment shot |
| 45–53.4s | Black and gold text stacks (package, bonuses, journey) | Typography works, but there is no imagery, so a long stretch is text-only | A18 (unveil hero) behind the package; A19 founding map behind the bonuses |
| 53.4–60s | Built form UI, then a black end card | Fine structurally; the end card is plain black | A20 end-card background |
| Not in video | M-Pesa only appears in the hook flash | M-Pesa must be clear and central | A11 customer pays, plus A11b phone close-up |
| Not in video | No Nairobi visual | "Nairobi first" is said but never shown | A17 Nairobi skyline |

**Other recommendations:**
- **No third-party snack brands.** Use unbranded, colourful international-style packaging or Snack Quest private-label packs. Real brands (Lay's, Takis, Fanta) create trademark risk in paid ads.
- **No Safaricom logo.** Show a green "payment" UI and add the word "M-Pesa" as an editor overlay. Never generate or copy Safaricom/M-Pesa trademark artwork.
- **Screens as plates.** Generate every phone and laptop screen as a plain green chroma screen. The real portal UI (already built in code) is composited in editing so the text stays crisp and truthful.

---

## Part 2 — Global consistency rules (apply to every prompt)

### Master machine reference
Attach `snack-quest-next/public/own/hero-machine.webp` as the image reference (image-to-image / style reference / "character" reference) for every prompt containing the machine. Describe it in every prompt as follows:

> **MACHINE SPEC (paste into prompts):** a tall, single-unit Snack Quest smart vending machine, about 1.9m tall. Matte black body. Large glass front on the left two-thirds showing 7 rows of colourful snack packs and drinks, with a backlit white LED strip at the top. Right-hand black control column holding a vertical touchscreen near eye level (white screen, "Choose a Snack Adventure" UI), below it a small "Pay with M-Pesa" panel, a contactless symbol and a yellow card reader. Wide horizontal black "PUSH" collection door at the bottom. Both side panels and the right front column wrapped in vivid artwork on black: a white-and-orange "Snack Quest" wordmark with a yellow sprout icon above it, the line "THE WORLD IN EVERY BITE", a white aeroplane with a dotted flight path, an orange-and-pink globe, tropical leaves in lime green, purple and orange, and city-landmark silhouettes (Eiffel Tower, pagodas, domes) in orange, purple and magenta along the bottom. Short black feet. The same machine in every shot — do not change shape, colours, wrap, screen position or proportions.

### People
- Realistic Kenyan and East African professionals and customers, aged 22–45, with varied skin tones and hairstyles.
- Natural, confident expressions; no exaggerated "stock smile".
- **Snack Quest staff:** black short-sleeve polo with the white/orange "Snack Quest" wordmark on the left chest, black trousers or dark jeans, and optional black cap.

### Style
- Premium cinematic commercial photography (think a high-end telecom or fintech campaign shot in Nairobi).
- Shot on a full-frame cinema camera, with 35mm/50mm/85mm lens feel and natural shallow depth of field. Fine, subtle grain.
- Colour grade: deep blacks; warm amber practical lights; accents of Snack Quest orange (#FF7A00), lime (#C8F031), purple (#7C3AED), teal (#19B3A6) and cream (#F6EEDD).

### Framing
- 9:16 vertical, 1080×1920 minimum; 2160×3840 preferred.
- **Keep clean negative space where noted:** top third for headlines, and avoid key detail in the bottom 18% (captions and platform UI sit there).

### Global negative prompt (append to every prompt)
> no text, no words, no letters, no watermark, no logos other than the Snack Quest wordmark, no Safaricom logo, no third-party snack brand logos, no distorted hands, no extra fingers, no warped faces, no plastic skin, no cartoon, no 3D render look, no oversaturated HDR, no fisheye, no duplicate machines unless requested, no redesigned or differently coloured vending machine, no empty abandoned feel, no clutter

---

## Part 3 — Shot list

### SHOT 01 — A01 Master machine cut-out (utility asset)

**Timestamp:** used across 0–60s (system diagram, fleet tiles, package unveil, end card).

**Purpose:** a clean, isolated machine used for motion graphics. It guarantees the identical machine wherever it is composited.

**Image type:** product shot (studio pack-shot).

**Exact visual:** the Snack Quest machine, fully stocked, isolated on a pure seamless black background. Two variants:
- **A01a:** dead-on front view.
- **A01b:** three-quarter view rotated 25° left, showing the left side wrap.

**Composition:** machine centred, filling 80% of the frame height, with a full 5% margin all round. Feet and a soft contact shadow visible.

**Camera:** 85mm lens feel at machine-centre height, f/8, everything sharp.

**Lighting:** large softbox key from the front-left, a thin strip-light rim on both edges to separate the black body from the black background, and the internal LED shelf lighting on.

**Overlay text:** none. This asset is cut out in editing.

**Generation prompt:**
> Studio product photograph of [MACHINE SPEC], fully stocked with colourful unbranded international snack packs and drinks, isolated on a seamless pure black background, dead-on front view (variant B: three-quarter view rotated 25 degrees to the left showing the decorated left side panel), machine centred and filling 80% of frame height with even margins, subtle soft contact shadow under the feet, large softbox key light from front-left, thin white strip-light rim lights tracing both vertical edges, internal LED shelf lighting glowing, crisp reflections on the glass, 85mm lens, f/8, tack-sharp, high-end product photography, 9:16 vertical. [GLOBAL NEGATIVE]

---

### SHOT 02 — A02 Snack Quest wordmark (brand asset)

**Timestamp:** 9.0–9.8s (logo sting) and 56.7–60s (end card).

**Purpose:** replaces the purple sticker logo so the brand matches the machine.

**Image type:** graphic (vector).

**Exact visual:** the "Snack" (white) and "Quest" (orange) wordmark with the yellow sprout icon above it, exactly as printed on the machine wrap. Transparent background.

**Composition:** centred, with generous padding.

**Overlay text:** none. This is the logo itself.

**Generation prompt:** do not generate with AI; AI garbles logos. Recreate it as a vector in Figma or Illustrator by tracing the wordmark from `hero-machine.webp`, or supply the original brand file. Export SVG plus PNG at 2000px wide on a transparent background, in white/orange and in all-white variants.

---

### SHOT 03 — A03 The problem

**Timestamp:** 5.4–9.0s.

**Purpose:** "Buying the machine is the easy part." The viewer must feel the overwhelm of doing it alone.

**Image type:** cinematic scene.

**Exact visual:** a Kenyan man of about 30–35, smart-casual (navy knit polo, chinos), standing beside a plain, unbranded, EMPTY black vending machine whose glass shows bare spiral coils and no products. He has one hand on his chin and is looking at the empty shelves, puzzled and slightly overwhelmed. Setting: an unfinished, dim corridor of a newly built commercial building in Nairobi, with bare concrete floor and a few unopened delivery cartons stacked untidily nearby. He is alone.

**Important:** this machine must NOT be the Snack Quest machine. It is a generic empty box, so that the Snack Quest machine in Shot 04 reads as the solution.

**Composition:** vertical. The man is in the lower-right third and the empty machine in the left half. The upper 40% is a clean, dark concrete wall for the editor's question tags (PRODUCTS? WAREHOUSE? RESTOCKING? INVENTORY? PAYMENTS? MANAGEMENT?).

**Camera:** 35mm, eye level, slight low angle, f/2.8.

**Lighting:** cool, flat fluorescent overheads, slightly desaturated, with one harsh practical light. The mood is deliberately less premium than the rest of the film.

**Overlay text (editor):** question tags animated into the upper space: WHERE DO I GET PRODUCTS? · WHO IMPORTS THEM? · WHERE DO I STORE THEM? · WHO RESTOCKS THE MACHINE? · WHAT'S ACTUALLY SELLING? · HOW DO I MANAGE 10 MACHINES?

**Generation prompt:**
> Cinematic vertical photograph, a Kenyan man in his early thirties wearing a navy knit polo and beige chinos stands beside a plain unbranded matte black vending machine with completely empty glass shelves showing bare metal spiral coils, he rests one hand on his chin and looks at the empty shelves with a puzzled, overwhelmed expression, setting is a dim unfinished corridor in a new Nairobi commercial building with bare polished concrete floor and a few untidy unopened cardboard cartons stacked on the floor, cool flat fluorescent overhead lighting, slightly desaturated colour, man positioned in lower right third, machine on the left half, upper 40% of frame is clean dark empty concrete wall (negative space for text overlays), 35mm lens, slight low angle, f/2.8 shallow depth of field, realistic commercial photography, 9:16. Negative: no Snack Quest branding on the machine, no products in the machine, no text. [GLOBAL NEGATIVE]

---

### SHOT 04 — A04 Hero reveal: the Snack Quest machine

**Timestamp:** 9.8–13.6s (the system reveal) and 13.6–15.8s ("Smart vending machine").

**Purpose:** the "answer" moment. The machine must look expensive, desirable and like infrastructure.

**Image type:** cinematic product scene.

**Exact visual:** the Snack Quest machine standing alone, perfectly stocked and glowing, in the lobby of a premium Nairobi office tower (Westlands style): polished dark terrazzo floor with reflections, warm timber-slat wall, brass accents, a tall indoor plant, and soft city lights through a glass curtain wall behind. Early evening, with a few softly blurred professionals walking far in the background.

**Composition:** machine centre-left, three-quarter view, occupying 65% of frame height. Floor reflection visible. Clean dark space in the top 25% for "THE MANAGED SNACK QUEST SYSTEM".

**Camera:** 50mm, low hero angle (camera at 80cm height looking slightly up), f/2.

**Lighting:** dramatic warm key from the left, the machine's own LED glow, an orange rim light on the right edge and cool blue city light behind.

**Overlay text (editor):** THE MANAGED SNACK QUEST SYSTEM (top), then the chain MACHINE ↓ PRODUCTS ↓ … on the right.

**Generation prompt:**
> Premium cinematic vertical photograph of [MACHINE SPEC] standing alone, fully stocked and glowing, in the lobby of a luxury Nairobi office tower at early evening, polished dark terrazzo floor with mirror-like reflections of the machine, warm vertical timber slat wall, brass details, a tall fiddle-leaf fig in a black planter, floor-to-ceiling glass behind showing soft blurred city lights of Westlands, two softly blurred Kenyan professionals walking far in the background, machine in three-quarter view centre-left occupying 65% of the frame height, low hero camera angle looking slightly up, 50mm lens, f/2, dramatic warm key light from left, orange rim light on right edge, internal LED glow, cool blue ambient from the city, top 25% of frame is clean dark ceiling space for headline text, high-end commercial photography, 9:16. [GLOBAL NEGATIVE]

---

### SHOT 05 — A05 The complete system (ecosystem graphic background)

**Timestamp:** 0–5.4s (hook backdrop) and 9.8–13.6s (alternative to the text chain).

**Purpose:** "the machine is only one part — Snack Quest is the system". The diagram itself is built in editing; this asset is the atmospheric base.

**Image type:** graphic / cinematic composite base.

**Exact visual:** A01a (front machine) centred on deep black, with a faint glowing lime circular ring around it and seven evenly spaced empty circular "nodes" (soft glowing discs) on the ring.

**Composition:** vertical. Machine centred at 45% height with the ring radius about 40% of frame width. The editor places icons and labels in the nodes: PRODUCT SOURCING · WAREHOUSE · RESTOCKING · TECHNOLOGY · PAYMENTS · CUSTOMERS · OPERATIONS.

**Lighting:** black void, with the ring and node glows in lime (#C8F031) and teal (#19B3A6) and subtle volumetric haze.

**Overlay text (editor):** the seven node labels; then "YOU DON'T HAVE TO BUILD THE VENDING BUSINESS YOURSELF."

**Generation prompt:**
> Minimal dark motion-graphics background, deep matte black void with subtle volumetric haze, a thin glowing lime green circle ring centred in the frame, seven evenly spaced softly glowing empty circular nodes sitting on the ring alternating lime green and teal, faint thin connecting light lines from each node towards the centre, centre of the ring left empty (a product will be composited there), elegant, premium, technology launch aesthetic, no text, no icons, 9:16 vertical. [GLOBAL NEGATIVE]

*(Composite A01a into the centre in editing. This is more reliable than asking the model to draw the machine into a diagram.)*

---

### SHOT 06 — A06 Product sourcing (global → Kenya)

**Timestamp:** 16.0–17.3s ("We source the products") and the hook flash at about 1.8s.

**Purpose:** Snack Quest finds and curates international products. The viewer must read "global products arriving in Kenya, curated by Snack Quest".

**Image type:** cinematic scene.

**Exact visual:** a container-yard scene at Nairobi's Inland Container Depot (Embakasi) at golden hour. A 20ft shipping container stands with its doors open, revealing neatly stacked cartons. In the foreground a Kenyan female sourcing manager (late 20s, black Snack Quest polo, hair in a neat bun, holding a tablet) inspects an open carton overflowing with colourful unbranded international snacks: Asian-style rice crackers, chip bags, gummy pouches, canned drinks. A second staff member with a pallet jack is behind her. Snack Quest-branded cartons (black with the orange/white wordmark) are stacked on the pallet.

**Composition:** vertical. The open carton and the manager's hands are in the lower half. The container doors frame the upper middle. Clean warm sky in the top 22%.

**Camera:** 35mm, chest height, f/2.8.

**Lighting:** golden-hour backlight with warm rim on the people and products, plus a soft fill.

**Overlay text (editor):** WE SOURCE. WE CURATE. YOU SELL. Optional small map graphic in editing: "ASIA · EUROPE · AMERICAS → KENYA".

**Generation prompt:**
> Cinematic vertical photograph at a Nairobi inland container depot at golden hour, a 20-foot shipping container with doors swung open revealing neatly stacked cartons, in the foreground a Kenyan woman in her late twenties wearing a black polo shirt with a small white and orange Snack Quest wordmark on the chest and her hair in a neat bun, holding a tablet and inspecting an open cardboard carton overflowing with colourful unbranded international snacks (rice crackers, chip bags, gummy pouches, canned drinks), black Snack Quest branded cartons with an orange wordmark stacked on a wooden pallet beside her, a male colleague with a pallet jack softly blurred behind, warm golden backlight with rim light on people and products, soft fill, 35mm lens at chest height, f/2.8, realistic premium commercial photography, top 22% of frame clean warm sky for text, 9:16. Negative: no real snack brand logos. [GLOBAL NEGATIVE]

---

### SHOT 07 — A07 Product macro (curated snacks)

**Timestamp:** hook flash about 1.2s; insert at about 16.5s; background for "Curated products".

**Purpose:** appetite appeal and "international curation". This replaces the blurry Takis/Lay's crop.

**Image type:** product shot (macro).

**Exact visual:** a hero arrangement of 10–12 colourful, unbranded international snack packs and drinks (matte and foil pouches, a tall can, a glass bottle of soda, a box of wafer sticks, a pouch of dried mango), artfully tumbling out of an open black Snack Quest box. Shot on a black reflective surface.

**Composition:** vertical, products bursting upward from the lower-middle box, negative space top 30%.

**Camera:** 100mm macro feel, slightly above, f/5.6 with focus on the front packs.

**Lighting:** dark studio with coloured gel rim lights (orange left, purple right), a crisp top light and specular highlights on the foil.

**Overlay text (editor):** none, or "CURATED INTERNATIONAL SNACKS".

**Generation prompt:**
> High-end advertising product photograph, an open matte black cardboard box with a white and orange Snack Quest wordmark on its side sitting on a black reflective surface, colourful unbranded international snack packs bursting upward out of it (foil chip bags, matte pouches, a box of wafer sticks, dried mango pouch, a tall drinks can, a small glass soda bottle), dynamic frozen-motion arrangement, dark studio, orange gel rim light from left, purple gel rim light from right, crisp top light, specular highlights on foil, 100mm macro lens slightly above, f/5.6, tack-sharp front packs, top 30% of frame empty black for text, 9:16. Negative: no real brand names or logos on any packaging. [GLOBAL NEGATIVE]

---

### SHOT 08 — A08 Central inventory (warehouse)

**Timestamp:** 17.3–18.7s ("Maintain inventory"); hook flash about 0.6s.

**Purpose:** "You do not need to build the supply chain alone." The warehouse must feel like infrastructure, not a storeroom.

**Image type:** cinematic scene.

**Exact visual:** the inside of a modern Snack Quest fulfilment warehouse in Nairobi. Tall orange-and-blue pallet racks, organised by labelled bays (labels left blank for editing), full of cartons of snacks and drinks. Black Snack Quest cartons in the foreground. A Kenyan warehouse operator in a black Snack Quest polo scans a carton with a handheld scanner. Through the open loading bay at the back stands a black Snack Quest delivery van with the colourful wrap. A large black wall banner at the back shows the Snack Quest wordmark and a world map.

**Composition:** vertical. Strong central perspective down the aisle (vanishing point at upper-centre). Operator in the lower-right third. Van small in the bay at the end of the aisle. Upper 25% is warehouse ceiling with hanging lights (clean for text).

**Camera:** 24–35mm, eye level, f/4.

**Lighting:** warm industrial high-bay pendants, daylight spilling through the loading bay and slight haze.

**Overlay text (editor):** CENTRAL INVENTORY · READY FOR REPLENISHMENT.

**Generation prompt:**
> Premium vertical cinematic photograph inside a modern Snack Quest fulfilment warehouse in Nairobi, tall orange and blue steel pallet racks on both sides of a clean polished-concrete aisle receding to a central vanishing point, racks neatly filled with cartons and shrink-wrapped trays of snacks and drinks organised by bay, black Snack Quest branded cartons with orange wordmark stacked in the foreground, a Kenyan male warehouse operator in a black Snack Quest polo scanning a carton with a handheld barcode scanner in the lower right third, at the far end an open loading bay with daylight and a black delivery van wrapped in colourful Snack Quest artwork, a large black wall banner with the Snack Quest wordmark and a world map high on the back wall, warm industrial high-bay pendant lights, light haze, 28mm lens, eye level, f/4, realistic high-end commercial photography, top 25% clean ceiling space for text, 9:16. [GLOBAL NEGATIVE]

*(Your existing `warehouse.png` is close to this. Regenerate only if you want the van and aisle composition. Keep it if consistency matters more.)*

---

### SHOT 09 — A09 Restocking the exact machine

**Timestamp:** 18.7–20.0s ("Support restocking"); hook flash about 2.4s.

**Purpose:** Snack Quest keeps the machine stocked. It must be unmistakably the SAME machine, open, being refilled.

**Image type:** cinematic scene.

**Exact visual:** the Snack Quest machine in a hotel corridor, front glass door swung open. The bottom two rows are visibly empty; the upper rows are full. A Kenyan male operator (late 20s, black Snack Quest polo and cap) kneels and loads colourful packs into the lower spirals from an open black Snack Quest carton. A small tablet leans on the carton, its screen glowing green (plate for a "restock checklist" overlay).

**Composition:** vertical. Machine fills the left 60% and the operator kneels in the right foreground. Product hands are in sharp focus. Top 20% shows the machine's top (wordmark) as clean dark space.

**Camera:** 35mm, 3/4 side angle at knee-to-chest height, f/2.8.

**Lighting:** warm hotel-corridor practical lights, the machine's LED shelf glow spilling onto his hands and face, and an orange rim.

**Overlay text (editor):** RESTOCKING SUPPORT. Optional chip: "MACHINE 002 · RESTOCKED".

**Generation prompt:**
> Cinematic vertical photograph, [MACHINE SPEC] standing in a warm hotel corridor with its front glass door swung fully open, the bottom two product rows visibly empty while upper rows are full, a Kenyan male operator in his late twenties wearing a black Snack Quest polo and black cap kneels in the right foreground loading colourful unbranded snack packs into the lower spiral rows from an open black Snack Quest carton, a small tablet leaning on the carton with a plain glowing green screen, machine occupying left 60% of frame, sharp focus on his hands and the products, warm practical corridor lighting with LED shelf glow spilling onto his hands and face, subtle orange rim light, 35mm lens, three-quarter side angle from knee height, f/2.8, premium commercial photography, 9:16. [GLOBAL NEGATIVE]

---

### SHOT 10 — A10 Owner portal: laptop plate

**Timestamp:** 20.0–21.3s ("Give you the technology"); hook flash about 3.0s.

**Purpose:** the strongest "technology" image. The real UI is composited onto the screen in editing.

**Image type:** UI mockup (device plate).

**Exact visual:** a premium silver/space-grey laptop open on a dark walnut desk in a calm, modern Nairobi home office at dusk. The screen is a flat chroma green (#00FF00), perfectly rectangular and unobstructed, at a slight three-quarter angle. A ceramic coffee cup, a notebook and a phone lie face-down beside it. Through the window behind, the Nairobi skyline glows softly out of focus.

**Composition:** vertical. Laptop in the lower-middle with the screen large (about 55% of frame width). Upper 30% is a softly blurred window and skyline.

**Camera:** 50mm, over-the-desk, slight high angle, f/2.8.

**Lighting:** warm desk lamp from the left; the cool screen will glow after compositing.

**Overlay text (editor):** composite the portal UI with FLEET OVERVIEW and the machine list (MACHINE 001 GYM / 002 HOTEL / 003 OFFICE / 004 RESIDENCE), ONLINE / LOW STOCK / RESTOCKING status, sales trend, top products, locations map and restock alerts. Label it "EXAMPLE DATA".

**Generation prompt:**
> Premium vertical lifestyle product photograph, a modern space-grey laptop open on a dark walnut desk in a calm contemporary Nairobi home office at dusk, the laptop screen is a perfectly flat uniform chroma green (#00FF00) with no reflections or glare and no content, slight three-quarter angle, a ceramic coffee cup, a black notebook and a smartphone lying face down beside the laptop, large window behind with the Nairobi skyline softly out of focus in blue dusk light, warm desk lamp lighting from the left, laptop in lower middle with screen occupying about 55% of frame width, upper 30% soft blurred window, 50mm lens slight high angle, f/2.8, high-end commercial photography, 9:16. Negative: no UI on screen, no text. [GLOBAL NEGATIVE]

---

### SHOT 11 — A11 M-Pesa customer moment (two frames)

**Timestamp:** new insert at about 21.3–23.0s (or in a customer beat), and the hook flash at about 3.6s.

**Purpose:** customers pay with M-Pesa. It must be instantly recognisable without using a trademark.

**Image type:** cinematic scene (A11a) plus close-up (A11b).

**Exact visual (A11a):** a Kenyan young professional woman (mid-20s, cream blazer, natural braids) at the Snack Quest machine in a busy office lobby. Her right finger touches the machine's touchscreen and her left hand holds a smartphone raised towards the M-Pesa panel. The phone screen shows a plain green confirmation screen. Colleagues blur past in the background.

**Exact visual (A11b):** a tight close-up of her hand holding the phone (screen chroma green) next to the machine's "Pay with M-Pesa" panel and contactless symbol, with the machine's glowing touchscreen edge visible.

**Composition:**
- **A11a:** she is right of centre and the machine fills the left half. Faces and hands are sharp.
- **A11b:** the phone fills 40% of the frame, with the panel softly in focus behind.

**Camera:** A11a 50mm at eye level, f/2. A11b 85mm close, f/2.2.

**Lighting:** soft lobby daylight, machine screen glow on her face and a warm rim.

**Overlay text (editor):** SCAN. PAY. COLLECT. Composite a green "Payment confirmed ✓" screen onto the phone, and add the word "M-Pesa" as typography (no Safaricom logo).

**Generation prompt (A11a):**
> Cinematic vertical photograph in a busy modern Nairobi office lobby, a Kenyan young professional woman in her mid-twenties with natural braids wearing a cream blazer stands at [MACHINE SPEC], her right index finger touching the machine's vertical touchscreen while her left hand holds a smartphone up toward the machine's small payment panel, the phone screen is a plain bright green, softly blurred colleagues walking past in the background, she stands right of centre and the machine fills the left half of the frame, sharp focus on her face and hands, soft daylight with the machine screen glow on her face and a warm rim light, 50mm lens at eye level, f/2, premium commercial photography, 9:16. Negative: no Safaricom logo, no readable text on phone. [GLOBAL NEGATIVE]

**Generation prompt (A11b):**
> Tight vertical close-up, a Kenyan woman's hand holding a smartphone whose screen is a flat uniform chroma green (#00FF00), held next to the payment panel of [MACHINE SPEC] showing the contactless symbol and yellow card reader, the edge of the glowing touchscreen visible above, shallow depth of field with the panel softly in focus behind the phone, warm rim light, 85mm lens, f/2.2, premium fintech commercial photography, 9:16. Negative: no logos on phone, no text on screen. [GLOBAL NEGATIVE]

---

### SHOT 12 — A12 Snack Quest operations (team, van and machine)

**Timestamp:** 21.3–23.0s ("Operational support"); hook flash about 4.2s.

**Purpose:** "There is a real operating business behind the technology."

**Image type:** cinematic scene.

**Exact visual:** a black delivery van fully wrapped in the Snack Quest artwork (wordmark, globe, leaves, landmarks) parked at the service entrance of a modern Nairobi building at morning. Three Kenyan Snack Quest team members in black polos: one carries a stack of black Snack Quest cartons, one checks a tablet, one pushes a hand truck with cartons towards the building. The Snack Quest machine is visible just inside the glass doors.

**Composition:** vertical, van on the left, team walking diagonally towards the right foreground, machine visible in the right-middle through the glass. Top 22% clean sky and building facade.

**Camera:** 35mm, eye level, f/3.5.

**Lighting:** fresh morning sun, side-lit, with slightly warm highlights.

**Overlay text (editor):** OPERATIONAL SUPPORT, or "WE HANDLE THE OPERATIONS".

**Generation prompt:**
> Cinematic vertical photograph at the service entrance of a modern glass office building in Nairobi in fresh morning sunlight, a black delivery van fully wrapped in colourful Snack Quest artwork (white and orange Snack Quest wordmark, orange globe, lime and purple tropical leaves, city landmark silhouettes) parked on the left, three Kenyan Snack Quest team members in black polos with the Snack Quest wordmark walking diagonally toward the right foreground — one carrying a stack of black Snack Quest cartons, one checking a tablet, one pushing a hand truck loaded with cartons — through the glass doors on the right the Snack Quest vending machine is visible inside the lobby, side-lit morning sun with warm highlights, 35mm lens at eye level, f/3.5, top 22% clean sky and facade for text, premium commercial photography, 9:16. [GLOBAL NEGATIVE]

---

### SHOT 13 — A13 The investor (dream outcome)

**Timestamp:** 23.1–29.8s ("Instead of becoming a full-time vending operator… focus on finding great locations").

**Purpose:** the protagonist of the opportunity. Calm control, not labour.

**Image type:** cinematic lifestyle scene.

**Exact visual:** a Kenyan woman entrepreneur (late 30s, tailored black suit with an orange silk top, short natural hair) seated in a premium Nairobi hotel-lounge coffee area. Laptop open (screen chroma green), smartphone in her hand (screen chroma green), relaxed and confident, glancing at the phone with a slight smile. Out of focus in the deep background stands the Snack Quest machine with its glow, and a customer at it.

**Composition:** vertical. She is in the lower-middle with laptop and phone clearly visible; the machine is a soft glowing shape upper-right in the background. Top 20% is clean.

**Camera:** 85mm, eye level, f/1.8, strong background separation.

**Lighting:** warm lounge practicals, window light on her face and screen glow.

**Overlay text (editor):** BUILD THE NETWORK. NOT THE BACK OFFICE. Composite the portal UI (fleet list) onto both screens.

**Generation prompt:**
> Cinematic vertical lifestyle photograph in a premium Nairobi hotel lounge café, a Kenyan businesswoman in her late thirties with short natural hair wearing a tailored black suit with an orange silk blouse sits relaxed in a leather armchair, an open laptop on the low table in front of her and a smartphone in her hand, both screens are flat uniform chroma green (#00FF00), she glances at the phone with a calm confident slight smile, deep in the softly blurred background the Snack Quest vending machine glows with a customer standing at it, warm lounge practical lights, soft window light on her face, 85mm lens at eye level, f/1.8, strong background bokeh, she sits in the lower middle of frame, top 20% clean for text, premium fintech-style commercial photography, 9:16. Negative: no UI or text on screens. [GLOBAL NEGATIVE]

---

### SHOT 14 — A14 Fleet tiles (multiple machines, four locations)

**Timestamp:** 29.8–33.4s (1 → 3 → 5 → 10 → 20 machines). Also used as the portal machine-row thumbnails.

**Purpose:** real scalability. The SAME machine in distinct locations replaces the copy-pasted thumbnail.

**Image type:** four matching cinematic scenes (series). Generate A15a, A15c, A15b and A15f (below) with identical framing, so they tile into a grid and multiply.

**Composition rule for the series:** machine front-on, centred, occupying 70% of frame height, at the same camera height and lens in every frame. The location identity comes from the surroundings.

**Overlay text (editor):** 1 MACHINE → 3 → 5 → 10 → 20, then ONE PORTAL. ONE SYSTEM. MULTIPLE MACHINES. Animated connector lines run from each tile to a central portal badge.

*(Prompts: see A15a/b/c/f, generated with "machine front-on, centred, 70% of frame height".)*

---

### SHOT 15 — A15 Location series (8 images, high footfall)

**Timestamp:** 37.0–45.0s (location grid / "We want great locations") and 0–5s (hook flashes).

**Purpose:** "Customers are already here". Every location must show people and activity.

**Image type:** cinematic scenes (a matched series).

**Series rules:**
- Same machine, front three-quarter view, on the right third of the frame.
- People in motion on the left.
- Eye level, 35mm, f/2.8.
- Grade consistent across all eight.
- Upper 20% kept clean.

**Overlay text (editor):** location label chip per tile: GYM · HOTEL · OFFICE · APARTMENTS · HOSPITAL · UNIVERSITY · PETROL STATION · FACTORY. Then ✓ marks, then LOCATION ASSESSMENT.

**A15a — Gym**
> Cinematic vertical photograph inside an upscale Nairobi gym, [MACHINE SPEC] standing against a dark wall on the right third of the frame, members in workout clothes on the left — a Kenyan woman wiping her face with a towel walking toward the machine, two men at weight racks softly blurred behind, rubber floor, mirror wall, moody warm gym lighting with lime accent strips, 35mm lens at eye level, f/2.8, energetic but premium, top 20% clean, 9:16. [GLOBAL NEGATIVE]

**A15b — Hotel lobby**
> Cinematic vertical photograph of a luxury Nairobi hotel lobby in the evening, [MACHINE SPEC] beside a marble pillar on the right third, a Kenyan couple with rolling luggage and a businessman checking his phone on the left, reception desk with warm pendant lights behind, polished stone floor reflections, 35mm lens at eye level, f/2.8, top 20% clean, 9:16. [GLOBAL NEGATIVE]

**A15c — Office**
> Cinematic vertical photograph of a bright modern Nairobi office floor at midday, [MACHINE SPEC] by a timber wall near the break-out area on the right third, Kenyan colleagues on the left — two chatting with coffee cups, one walking past with a laptop, open-plan desks and plants behind, soft daylight, 35mm lens at eye level, f/2.8, top 20% clean, 9:16. [GLOBAL NEGATIVE]

**A15d — Apartment / residential**
> Cinematic vertical photograph of the lobby of an upscale Nairobi apartment building (Kilimani style) in the early evening, [MACHINE SPEC] near the mailbox wall on the right third, a young Kenyan resident with shopping bags and a mother with a child walking in on the left, warm timber and stone interior, concierge desk softly blurred, 35mm lens at eye level, f/2.8, top 20% clean, 9:16. [GLOBAL NEGATIVE]

**A15e — Hospital**
> Cinematic vertical photograph of a clean modern private-hospital waiting area in Nairobi, [MACHINE SPEC] against a pale wall on the right third, visitors seated in the waiting chairs and a Kenyan nurse in light-blue scrubs walking past on the left, bright soft clinical-but-warm lighting, plants, 35mm lens at eye level, f/2.8, calm and reassuring, top 20% clean, 9:16. Negative: no medical procedures, no patients in distress. [GLOBAL NEGATIVE]

**A15f — University**
> Cinematic vertical photograph of a busy modern university student centre in Nairobi, [MACHINE SPEC] by a glass wall on the right third, Kenyan students with backpacks and laptops walking and chatting on the left, one student approaching the machine, daylight, lively, 35mm lens at eye level, f/2.8, top 20% clean, 9:16. Negative: no school uniforms. [GLOBAL NEGATIVE]

**A15g — Petrol station**
> Cinematic vertical photograph of a modern Nairobi petrol station forecourt convenience area at dusk, [MACHINE SPEC] standing under the shop canopy beside the entrance on the right third, a Kenyan motorist walking from his car toward it and a rider in a reflective vest by the pumps on the left, warm canopy lights against a deep blue dusk sky, 35mm lens at eye level, f/2.8, top 20% clean, 9:16. Negative: no real fuel company logos or colours. [GLOBAL NEGATIVE]

**A15h — Factory / workforce canteen**
> Cinematic vertical photograph of a clean modern factory staff canteen in Nairobi's industrial area during a shift break, [MACHINE SPEC] against a wall on the right third, Kenyan workers in hi-vis vests and safety boots queuing and chatting on the left, long canteen tables behind, bright even industrial lighting with warm accents, 35mm lens at eye level, f/2.8, top 20% clean, 9:16. [GLOBAL NEGATIVE]

---

### SHOT 16 — A16 Location assessment

**Timestamp:** 43.3–45.0s ("Every location will be assessed"), replacing the stamp-only beat.

**Purpose:** Snack Quest is selective. Not every location qualifies.

**Image type:** cinematic scene.

**Exact visual:** two Snack Quest staff (one Kenyan man, one Kenyan woman, black polos) in an empty corner of a busy office lobby where a machine is NOT yet placed. She holds a tablet (screen chroma green) and he measures the floor space with a laser distance meter (a red dot visible on the wall). A building manager in a suit points at the spot. People walk past in the background.

**Composition:** vertical. The empty floor spot is in the centre-right and the three people on the left. Top 20% clean.

**Camera:** 35mm, eye level, f/2.8.

**Lighting:** bright modern lobby daylight.

**Overlay text (editor):** LOCATION ASSESSMENT. Checklist chips: FOOTFALL ✓ · SECURITY ✓ · ACCESS ✓ · POWER ✓.

**Generation prompt:**
> Cinematic vertical photograph in a busy modern Nairobi office lobby, two Snack Quest staff (a Kenyan man and a Kenyan woman in black polos with the Snack Quest wordmark) assessing an empty floor space by a wall where a vending machine will go, she holds a tablet with a flat chroma green screen, he points a small laser distance meter at the wall with a visible red dot, a Kenyan building manager in a dark suit gestures toward the spot, people walking past softly blurred in the background, the empty floor spot at centre-right, bright daylight, 35mm lens at eye level, f/2.8, top 20% clean, premium commercial photography, 9:16. Negative: no vending machine in the frame. [GLOBAL NEGATIVE]

---

### SHOT 17 — A17 Nairobi first

**Timestamp:** 37.0–39.6s (new "Nairobi first" beat before the location grid), and the hook.

**Purpose:** Nairobi-first rollout; prove it close, then expand.

**Image type:** cinematic landscape.

**Exact visual:** the Nairobi skyline at golden hour seen from the west (Upper Hill / Ngong Road direction): KICC, the Upper Hill towers, the leafy suburbs in the foreground and warm haze.

**Composition:** vertical. Skyline in the middle band; the sky in the top 35% is clean for the headline, and the darker foreground is in the bottom third.

**Camera:** 135mm compression from an elevated position, f/5.6.

**Lighting:** golden hour with long shadows, a warm sky grading to deep blue at the top.

**Overlay text (editor):** NAIROBI FIRST, then an animated graphic: NAIROBI → PROVE THE MODEL → KENYA (no dates).

**Generation prompt:**
> Cinematic vertical photograph of the Nairobi city skyline at golden hour viewed from an elevated position to the west, the KICC tower and Upper Hill skyscrapers rising above lush green tree-lined suburbs in the foreground, warm atmospheric haze, long shadows, sky grading from warm amber at the horizon to deep blue at the top, 135mm lens compression, f/5.6, skyline in the middle band of the frame, top 35% clean sky for headline text, premium travel-commercial photography, 9:16. Negative: no text, no fictional buildings. [GLOBAL NEGATIVE]

---

### SHOT 18 — A18 Founding Partner unveil (package backdrop)

**Timestamp:** 45.0–49.8s (FOUNDING PARTNER PACKAGE stack).

**Purpose:** the "offer" moment. It must feel exclusive and premium, like a product launch stage.

**Image type:** cinematic product scene.

**Exact visual:** the Snack Quest machine (A01b angle) alone on a black stage, under a single overhead spotlight with a gold/orange haze. Fine gold dust particles float in the beam. The floor is glossy black.

**Composition:** vertical. Machine in the lower-centre at 50% of frame height. The upper 45% is spotlit haze and dark, kept clean for the package list.

**Camera:** 50mm, low angle, f/4.

**Lighting:** single hard overhead spot, warm gold (#FFB000 to #FF7A00) volumetric haze and a subtle rim.

**Overlay text (editor):** FOUNDING PARTNER PACKAGE, then the eight included items.

**Generation prompt:**
> Cinematic vertical launch-event photograph, [MACHINE SPEC] in three-quarter view standing alone on a glossy black stage floor in a dark void, a single hard overhead spotlight creating a warm gold-orange volumetric beam with fine floating gold dust particles, subtle warm rim light outlining the machine, glossy floor reflection, machine in the lower centre occupying 50% of frame height, upper 45% dark atmospheric haze kept clean for text, 50mm lens low angle, f/4, luxurious exclusive mood, premium product launch photography, 9:16. [GLOBAL NEGATIVE]

---

### SHOT 19 — A19 Founding partners map

**Timestamp:** 49.8–53.4s (BONUSES / FIRST NAIROBI COHORT).

**Purpose:** exclusivity, with a few selected Nairobi locations lit.

**Image type:** graphic (stylised map). Best built from real map data in editing; a generated base is fine for mood.

**Exact visual:** a dark, minimal stylised map of Nairobi: deep charcoal land, subtle teal road lines, with about 6 small glowing orange points clustered in Westlands, Kilimani, Upper Hill, CBD, Karen and the Thika Road area. All other areas are dim.

**Composition:** vertical, map filling the frame, the lit cluster in the centre-upper area. Bottom 30% darker for the bonus list.

**Lighting:** dark, glowing points with soft bloom.

**Overlay text (editor):** FOUNDING PARTNERS · FIRST NAIROBI COHORT. Area labels are added as typography in editing (do not generate place names).

**Generation prompt:**
> Minimal dark stylised city map of Nairobi seen from directly above, deep charcoal land, very subtle thin teal road network lines, no labels, about six small glowing orange points with soft bloom clustered across the western and central districts, everything else dim and quiet, elegant premium data-visualisation aesthetic, centre-upper area holds the lit cluster, bottom 30% darker for text, no text, no place names, 9:16. [GLOBAL NEGATIVE]

*(Recommended: build it in editing from OpenStreetMap vector data for accuracy. A generated map will not be geographically correct.)*

---

### SHOT 20 — A20 Final CTA background

**Timestamp:** 56.7–60s (end card), also behind the form (53.4–56.7s).

**Purpose:** a clean final card for the Facebook Lead Form transition. Visually simple and obvious.

**Image type:** cinematic scene, heavily darkened (background plate).

**Exact visual:** the Snack Quest machine in a busy, softly blurred office lobby at evening. The machine is lower-right and glowing, and people are bokeh shapes. Everything sits under a strong dark gradient, so the top 70% reads almost black.

**Composition:** vertical. Machine in the lower-right quarter. The top 70% is dark and clean for: logo, HAVE THE LOCATION?, APPLY TO BECOME A SNACK QUEST FOUNDING PARTNER, APPLY NOW button, "Nairobi First • December 2026".

**Camera:** 85mm, f/1.8, heavy bokeh.

**Lighting:** low-key, machine glow as the main light source.

**Overlay text (editor):**
- Wordmark (A02).
- HAVE THE LOCATION?
- APPLY TO BECOME A SNACK QUEST FOUNDING PARTNER
- An orange button: APPLY NOW
- Nairobi First • December 2026
- *The world in every bite.*

**Generation prompt:**
> Low-key cinematic vertical photograph, [MACHINE SPEC] glowing in the lower right quarter of the frame inside a softly blurred busy Nairobi office lobby at evening, passers-by rendered as soft warm bokeh shapes, strong natural darkness so the top 70% of the frame is almost black and completely clean, the machine's LED glow is the main light source, 85mm lens, f/1.8, heavy bokeh, elegant minimal mood, 9:16. [GLOBAL NEGATIVE]

---

## Part 4 — Production summary

| ID | Asset | Type | Priority |
|---|---|---|---|
| A01a/b | Machine cut-out, front + 3/4 | Product shot | **Must** — powers graphics and consistency |
| A02 | Wordmark vector | Graphic (no AI) | **Must** |
| A03 | The problem (generic empty machine) | Cinematic | **Must** |
| A04 | Hero reveal, office tower lobby | Cinematic product | **Must** |
| A05 | Ecosystem ring background | Graphic | Nice |
| A06 | Sourcing at container depot | Cinematic | **Must** |
| A07 | Snack macro burst (unbranded) | Product | **Must** |
| A08 | Warehouse aisle and van | Cinematic | Optional (existing image is close) |
| A09 | Restocking the open machine | Cinematic | **Must** |
| A10 | Laptop on desk, chroma screen | UI plate | **Must** |
| A11a/b | M-Pesa customer, wide + phone close-up | Cinematic | **Must** |
| A12 | Ops team, van and building | Cinematic | **Must** |
| A13 | Investor in lounge, chroma screens | Cinematic | **Must** |
| A14 | Fleet tiles (uses A15a/b/c/f) | Series | **Must** |
| A15a–h | 8 high-footfall locations | Series | **Must** (a, b, c, f first) |
| A16 | Location assessment | Cinematic | **Must** |
| A17 | Nairobi skyline | Landscape | **Must** |
| A18 | Founding partner unveil stage | Product | **Must** |
| A19 | Founding partners map | Graphic | Nice (build from real map) |
| A20 | Final CTA background | Plate | **Must** |

**Generation tips:**
- **Generation order:** generate A01 and A04 first and approve them as the master look. Then feed A04 as the style reference for every later prompt, alongside `hero-machine.webp` as the machine reference.
- **Check the machine in every output:** wordmark position, touchscreen and payment column on the right, PUSH door, black feet, wrap colours. Reject any frame where the machine changed.
- **Hands and phones:** generate 4 variants each and pick the cleanest. Hands holding phones are the most common failure.
- **Upload format:** send finished images as PNG or high-quality JPG (minimum 1080×1920). Attach them in the chat or commit them to `marketing/assets/` and I will rebuild the video around them.
