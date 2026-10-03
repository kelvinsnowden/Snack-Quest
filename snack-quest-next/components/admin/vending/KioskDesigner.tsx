'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Eye, EyeOff, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  KIOSK_LIMITS,
  KIOSK_TRANSLATABLE_LOCALES,
  KioskConfigValidationError,
  checkKioskExperience,
  mergeKioskExperience,
  parseKioskPatch,
} from '@/lib/kiosk/experienceConfig';
import {
  KIOSK_BADGE_STATES,
  KIOSK_BADGE_TONES,
  KIOSK_FONTS,
  KIOSK_FONT_LABEL,
  KIOSK_LOCALES,
  KIOSK_LOCALE_LABEL,
  KIOSK_RADII,
  KIOSK_SECTION_LABEL,
  KIOSK_SECTION_TYPES,
  KIOSK_THEME_COLOR_KEYS,
  KIOSK_THEME_COLOR_LABEL,
  type KioskBadgeState,
  type KioskExperienceConfig,
  type KioskExperiencePatch,
  type KioskLayerScope,
  type KioskLocale,
  type KioskSection,
  type KioskSectionType,
  type KioskThemeColorKey,
} from '@/types/kioskExperience';

type Version = { versionNumber: number; note: string; rolledBackFrom: number | null; publishedBy: string; publishedAt: string | null };
type PreviewMachine = { id: string; code: string; widthPx: number; heightPx: number; profileSet: boolean };
type Result = { ok: boolean; text: string } | null;

const selectClass = 'min-h-10 w-full rounded-md border border-border bg-surface px-2 text-sm';
const BADGE_NAME: Record<KioskBadgeState, string> = { featured: 'Featured', new: 'New', limited_time: 'Limited time' };
const TONE_LABEL = { primary: 'Main button colour', secondary: 'Second accent', highlight: 'Highlight' } as const;
const COPY_LABEL = { bannerEyebrow: 'Banner small line', bannerHeadline: 'Banner headline', attractHeadline: 'Idle-screen headline', attractCallToAction: '“Tap to start” button' } as const;

async function send(url: string, method: 'PUT' | 'POST' | 'DELETE', body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const check = data?.check as { errors?: string[] } | undefined;
    const problems = (data?.problems as string[] | undefined) ?? check?.errors;
    throw new Error(problems?.length ? problems.join(' ') : ((data?.error as string) ?? `Couldn’t save (HTTP ${response.status}).`));
  }
  return data ?? {};
}

function Message({ result }: { result: Result }) {
  if (!result) return null;
  return (
    <p role={result.ok ? 'status' : 'alert'} className={`flex items-start gap-2 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}>
      {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
      {result.text}
    </p>
  );
}

/** "Inherited" or "Set here", with a way back to inheriting. */
function Origin({ overridden, onReset, disabled }: { overridden: boolean; onReset: () => void; disabled: boolean }) {
  if (!overridden) return <span className="text-caption text-muted-foreground">Inherited</span>;
  return (
    <button type="button" onClick={onReset} disabled={disabled} className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline disabled:opacity-50">
      <RotateCcw className="size-3" aria-hidden="true" />
      Set here · use inherited
    </button>
  );
}

function newSection(type: KioskSectionType, existing: KioskSection[]): KioskSection {
  let n = 1;
  while (existing.some((section) => section.id === `${type.split('_')[0]}${n}`)) n += 1;
  const id = `${type.split('_')[0]}${n}`;
  if (type === 'promo_message') return { id, type, visible: true, props: { text: 'Your message here', tone: 'highlight' } };
  if (type === 'featured_products') return { id, type, visible: true, props: { title: 'Featured', limit: 4 } };
  if (type === 'product_grid') return { id, type, visible: true, props: { columns: 'auto' } };
  return { id, type, visible: true, props: {} };
}

/**
 * The screen design builder for one layer (§ KIOSK EXPERIENCE BUILDER).
 * Every field shows the value machines would see and whether this layer
 * sets it or inherits it. Checks run as you type, with the same rules the
 * server applies on publish; the preview shows the saved draft on a real
 * machine's screen at its own size.
 */
export function KioskDesigner({
  scope,
  scopeId,
  initialDraft,
  inherited,
  versions,
  liveVersionNumber,
  previewMachines,
  canDesign,
  canPublish,
}: {
  scope: KioskLayerScope;
  scopeId: string;
  initialDraft: KioskExperiencePatch;
  inherited: KioskExperienceConfig;
  versions: Version[];
  liveVersionNumber: number | null;
  previewMachines: PreviewMachine[];
  canDesign: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<KioskExperiencePatch>(initialDraft);
  const [savedDraft, setSavedDraft] = useState(JSON.stringify(initialDraft));
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);
  const [note, setNote] = useState('');
  const [previewId, setPreviewId] = useState(previewMachines[0]?.id ?? '');
  const [previewIdle, setPreviewIdle] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  const base = `/api/vending/kiosk/layers/${scope}/${encodeURIComponent(scopeId)}`;
  const dirty = JSON.stringify(draft) !== savedDraft;
  const readOnly = !canDesign;

  const { effective, parseProblems, check } = useMemo(() => {
    try {
      const parsed = parseKioskPatch(draft);
      const merged = mergeKioskExperience(inherited, parsed);
      return { effective: merged, parseProblems: [] as string[], check: checkKioskExperience(merged) };
    } catch (error) {
      const problems = error instanceof KioskConfigValidationError ? error.problems : ['These settings can’t be read.'];
      return { effective: mergeKioskExperience(inherited), parseProblems: problems, check: { errors: [], warnings: [] } };
    }
  }, [draft, inherited]);

  const sections = draft.browseSections ?? effective.browseSections;
  const sectionsOverridden = draft.browseSections !== undefined;

  function update(mutator: (next: KioskExperiencePatch) => void) {
    setDraft((current) => {
      const next = structuredClone(current);
      mutator(next);
      return next;
    });
    setResult(null);
  }

  function setColor(key: KioskThemeColorKey, value: string | undefined) {
    update((next) => {
      next.theme = { ...(next.theme ?? {}), colors: { ...(next.theme?.colors ?? {}) } };
      if (value === undefined) delete next.theme.colors![key];
      else next.theme.colors![key] = value;
      if (Object.keys(next.theme.colors!).length === 0) delete next.theme.colors;
      if (Object.keys(next.theme).length === 0) delete next.theme;
    });
  }

  function setThemeField(key: 'radius' | 'font' | 'motion', value: string | undefined) {
    update((next) => {
      next.theme = { ...(next.theme ?? {}) };
      if (value === undefined) delete next.theme[key];
      else (next.theme as Record<string, unknown>)[key] = value;
      if (Object.keys(next.theme).length === 0) delete next.theme;
    });
  }

  function setGroupField<G extends 'productCard' | 'idle' | 'copy'>(group: G, key: string, value: unknown) {
    update((next) => {
      const current = { ...((next[group] as Record<string, unknown> | undefined) ?? {}) };
      if (value === undefined) delete current[key];
      else current[key] = value;
      if (Object.keys(current).length === 0) delete next[group];
      else (next as Record<string, unknown>)[group] = current;
    });
  }

  function setBadge(state: KioskBadgeState, key: 'label' | 'tone' | 'visible', value: unknown) {
    update((next) => {
      const badges = { ...(next.badges ?? {}) } as Record<string, Record<string, unknown>>;
      const badge = { ...(badges[state] ?? {}) };
      if (value === undefined) delete badge[key];
      else badge[key] = value;
      if (Object.keys(badge).length === 0) delete badges[state];
      else badges[state] = badge;
      if (Object.keys(badges).length === 0) delete next.badges;
      else next.badges = badges as KioskExperiencePatch['badges'];
    });
  }

  function setLanguage(key: 'available' | 'default', value: KioskLocale[] | KioskLocale | undefined) {
    update((next) => {
      const language = { ...(next.language ?? {}) } as Record<string, unknown>;
      if (value === undefined) delete language[key];
      else language[key] = value;
      if (Object.keys(language).length === 0) delete next.language;
      else next.language = language as KioskExperiencePatch['language'];
    });
  }

  /** Sets one translated phrase; an empty one is removed (it then shows in English). */
  function setTranslation(locale: KioskLocale, path: ['copy' | 'badges', string] | ['sections', string, 'text' | 'title'], value: string) {
    update((next) => {
      const translations = structuredClone(next.translations ?? {}) as Record<string, Record<string, Record<string, unknown>>>;
      const translation = translations[locale] ?? {};
      const group = { ...((translation[path[0]] as Record<string, unknown>) ?? {}) };
      if (path[0] === 'sections') {
        const entry = { ...((group[path[1]] as Record<string, string>) ?? {}) };
        if (value.trim()) entry[path[2]] = value;
        else delete entry[path[2]];
        if (Object.keys(entry).length === 0) delete group[path[1]];
        else group[path[1]] = entry;
      } else if (value.trim()) group[path[1]] = value;
      else delete group[path[1]];
      if (Object.keys(group).length === 0) delete translation[path[0]];
      else translation[path[0]] = group;
      if (Object.keys(translation).length === 0) delete translations[locale];
      else translations[locale] = translation;
      if (Object.keys(translations).length === 0) delete next.translations;
      else next.translations = translations as KioskExperiencePatch['translations'];
    });
  }

  function setSections(list: KioskSection[] | undefined) {
    update((next) => {
      if (list === undefined) delete next.browseSections;
      else next.browseSections = list;
    });
  }

  function editSection(index: number, change: (section: KioskSection) => void) {
    const list = structuredClone(sections);
    change(list[index]);
    setSections(list);
  }

  function move(index: number, delta: number) {
    const list = structuredClone(sections);
    const [item] = list.splice(index, 1);
    list.splice(index + delta, 0, item);
    setSections(list);
  }

  async function run(label: string, action: () => Promise<string>) {
    setBusy(label);
    setResult(null);
    try {
      setResult({ ok: true, text: await action() });
      router.refresh();
    } catch (error) {
      setResult({ ok: false, text: error instanceof Error ? error.message : 'Something went wrong.' });
    } finally {
      setBusy(null);
    }
  }

  const saveDraft = () =>
    run('save', async () => {
      await send(base, 'PUT', { draft });
      setSavedDraft(JSON.stringify(draft));
      setPreviewKey((key) => key + 1);
      return 'Draft saved. Machines still show the published version.';
    });

  const publish = () =>
    run('publish', async () => {
      if (dirty) {
        await send(base, 'PUT', { draft });
        setSavedDraft(JSON.stringify(draft));
      }
      const published = await send(`${base}/publish`, 'POST', { note });
      setNote('');
      return `Published as version ${published.versionNumber}. Machines pick it up within a minute.`;
    });

  const rollback = (versionNumber: number) =>
    run(`rollback-${versionNumber}`, async () => {
      const published = await send(`${base}/rollback`, 'POST', { versionNumber });
      const state = await (await fetch(base, { cache: 'no-store' })).json();
      setDraft(state.draft ?? {});
      setSavedDraft(JSON.stringify(state.draft ?? {}));
      setPreviewKey((key) => key + 1);
      return `Version ${versionNumber} is live again, as version ${published.versionNumber}.`;
    });

  const withdraw = () =>
    run('withdraw', async () => {
      await send(base, 'DELETE');
      return 'Taken off. These machines now show the layer above.';
    });

  const previewMachine = previewMachines.find((machine) => machine.id === previewId);
  const frameWidth = previewMachine?.widthPx ?? 1080;
  const frameHeight = previewMachine?.heightPx ?? 1920;
  const scale = Math.min(360 / frameWidth, 640 / frameHeight);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Checks</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {parseProblems.length === 0 && check.errors.length === 0 ? (
              <p className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Ready to publish{check.warnings.length > 0 ? ', with notes below' : ''}.
              </p>
            ) : null}
            {[...parseProblems, ...check.errors].map((problem) => (
              <p key={problem} className="flex items-start gap-2 text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {problem}
              </p>
            ))}
            {check.warnings.map((warning) => (
              <p key={warning} className="flex items-start gap-2 text-warning">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {warning}
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Colours and style</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {KIOSK_THEME_COLOR_KEYS.map((key) => {
                const own = draft.theme?.colors?.[key];
                const value = own ?? effective.theme.colors[key];
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor={`color-${key}`} className="text-sm font-medium">
                        {KIOSK_THEME_COLOR_LABEL[key]}
                      </label>
                      <Origin overridden={own !== undefined} onReset={() => setColor(key, undefined)} disabled={readOnly} />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`Pick ${KIOSK_THEME_COLOR_LABEL[key].toLowerCase()}`}
                        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
                        disabled={readOnly}
                        onChange={(event) => setColor(key, event.target.value.toLowerCase())}
                        className="size-10 shrink-0 cursor-pointer rounded-md border border-border bg-surface p-1 disabled:cursor-not-allowed"
                      />
                      <Input id={`color-${key}`} value={value} disabled={readOnly} onChange={(event) => setColor(key, event.target.value.trim().toLowerCase())} className="min-h-10 font-mono tabular-nums" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="flex items-center justify-between gap-2 font-medium">
                  Corners <Origin overridden={draft.theme?.radius !== undefined} onReset={() => setThemeField('radius', undefined)} disabled={readOnly} />
                </span>
                <select className={selectClass} disabled={readOnly} value={effective.theme.radius} onChange={(event) => setThemeField('radius', event.target.value as (typeof KIOSK_RADII)[number])}>
                  {KIOSK_RADII.map((radius) => (
                    <option key={radius} value={radius}>
                      {{ square: 'Square', standard: 'Rounded', round: 'Very round' }[radius]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="flex items-center justify-between gap-2 font-medium">
                  Font <Origin overridden={draft.theme?.font !== undefined} onReset={() => setThemeField('font', undefined)} disabled={readOnly} />
                </span>
                <select className={selectClass} disabled={readOnly} value={effective.theme.font} onChange={(event) => setThemeField('font', event.target.value as (typeof KIOSK_FONTS)[number])}>
                  {KIOSK_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {KIOSK_FONT_LABEL[font]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="flex items-center justify-between gap-2 font-medium">
                  Motion <Origin overridden={draft.theme?.motion !== undefined} onReset={() => setThemeField('motion', undefined)} disabled={readOnly} />
                </span>
                <select className={selectClass} disabled={readOnly} value={effective.theme.motion} onChange={(event) => setThemeField('motion', event.target.value as 'standard' | 'reduced')}>
                  <option value="standard">Animated</option>
                  <option value="reduced">Still (no animation)</option>
                </select>
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Menu layout</CardTitle>
            {sectionsOverridden ? (
              <Origin overridden onReset={() => setSections(undefined)} disabled={readOnly} />
            ) : (
              <span className="text-caption text-muted-foreground">Inherited — change anything below to set it here</span>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ol className="flex flex-col gap-2">
              {sections.map((section, index) => (
                <li key={section.id} className={`flex flex-col gap-2 rounded-md border border-border p-3 ${section.visible ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 text-sm font-medium">{KIOSK_SECTION_LABEL[section.type]}</span>
                    <Button size="sm" variant="ghost" disabled={readOnly || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${KIOSK_SECTION_LABEL[section.type]} up`}>
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={readOnly || index === sections.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${KIOSK_SECTION_LABEL[section.type]} down`}>
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => editSection(index, (s) => void (s.visible = !s.visible))} aria-label={section.visible ? `Hide ${KIOSK_SECTION_LABEL[section.type]}` : `Show ${KIOSK_SECTION_LABEL[section.type]}`}>
                      {section.visible ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setSections(sections.filter((_, i) => i !== index))} aria-label={`Remove ${KIOSK_SECTION_LABEL[section.type]}`}>
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  {section.type === 'promo_message' ? (
                    <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                      <Input aria-label="Message" maxLength={KIOSK_LIMITS.promoTextMax} value={section.props.text ?? ''} disabled={readOnly} onChange={(event) => editSection(index, (s) => void (s.props.text = event.target.value))} className="min-h-10" />
                      <select aria-label="Message colour" className={selectClass} disabled={readOnly} value={section.props.tone ?? 'highlight'} onChange={(event) => editSection(index, (s) => void (s.props.tone = event.target.value as KioskSection['props']['tone']))}>
                        {KIOSK_BADGE_TONES.map((tone) => (
                          <option key={tone} value={tone}>
                            {TONE_LABEL[tone]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {section.type === 'featured_products' ? (
                    <div className="grid gap-2 sm:grid-cols-[1fr_8rem]">
                      <Input aria-label="Row title" maxLength={KIOSK_LIMITS.sectionTitleMax} value={section.props.title ?? ''} disabled={readOnly} onChange={(event) => editSection(index, (s) => void (s.props.title = event.target.value))} className="min-h-10" />
                      <select aria-label="How many snacks" className={selectClass} disabled={readOnly} value={section.props.limit ?? 4} onChange={(event) => editSection(index, (s) => void (s.props.limit = Number(event.target.value)))}>
                        {Array.from({ length: KIOSK_LIMITS.featuredLimitMax }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            Up to {n}
                          </option>
                        ))}
                      </select>
                      <p className="text-caption text-muted-foreground sm:col-span-2">Shows snacks marked “Featured” in this machine’s assortment. Hidden when there are none.</p>
                    </div>
                  ) : null}
                  {section.type === 'product_grid' ? (
                    <select aria-label="Columns" className={`${selectClass} sm:w-56`} disabled={readOnly} value={String(section.props.columns ?? 'auto')} onChange={(event) => editSection(index, (s) => void (s.props.columns = event.target.value === 'auto' ? 'auto' : (Number(event.target.value) as 2 | 3 | 4)))}>
                      <option value="auto">Columns: fit the screen</option>
                      <option value="2">2 columns</option>
                      <option value="3">Up to 3 columns</option>
                      <option value="4">Up to 4 columns</option>
                    </select>
                  ) : null}
                </li>
              ))}
            </ol>
            {canDesign && sections.length < KIOSK_LIMITS.sectionsMax ? (
              <div className="flex flex-wrap gap-2">
                {KIOSK_SECTION_TYPES.filter((type) => type === 'promo_message' || type === 'featured_products' || !sections.some((section) => section.type === type)).map((type) => (
                  <Button key={type} size="sm" variant="outline" onClick={() => setSections([...sections, newSection(type, sections)])}>
                    <Plus className="size-4" aria-hidden="true" />
                    {KIOSK_SECTION_LABEL[type]}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Badges and product tiles</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {KIOSK_BADGE_STATES.map((state) => {
              const own = draft.badges?.[state];
              const badge = effective.badges[state];
              return (
                <div key={state} className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_12rem_auto]">
                  <span className="text-sm font-medium">{BADGE_NAME[state]}</span>
                  <Input aria-label={`${BADGE_NAME[state]} badge text`} maxLength={KIOSK_LIMITS.badgeLabelMax} value={badge.label} disabled={readOnly} onChange={(event) => setBadge(state, 'label', event.target.value)} className="min-h-10" />
                  <select aria-label={`${BADGE_NAME[state]} badge colour`} className={selectClass} disabled={readOnly} value={badge.tone} onChange={(event) => setBadge(state, 'tone', event.target.value)}>
                    {KIOSK_BADGE_TONES.map((tone) => (
                      <option key={tone} value={tone}>
                        {TONE_LABEL[tone]}
                      </option>
                    ))}
                  </select>
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input type="checkbox" checked={badge.visible} disabled={readOnly} onChange={(event) => setBadge(state, 'visible', event.target.checked)} />
                    Show
                  </label>
                  {own ? (
                    <div className="sm:col-span-4">
                      <Origin overridden onReset={() => update((next) => void delete next.badges?.[state])} disabled={readOnly} />
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              {(
                [
                  ['showOrigin', 'Show where each snack is from'],
                  ['showBadges', 'Show badges on tiles'],
                  ['quickAdd', 'The + button adds straight to the order (off: it opens the snack first)'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex flex-wrap items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={effective.productCard[key]} disabled={readOnly} onChange={(event) => setGroupField('productCard', key, event.target.checked)} />
                    {label}
                  </label>
                  <Origin overridden={draft.productCard?.[key] !== undefined} onReset={() => setGroupField('productCard', key, undefined)} disabled={readOnly} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Idle screen and wording</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="flex items-center justify-between gap-2 font-medium">
                  Go idle after (seconds) <Origin overridden={draft.idle?.timeoutSeconds !== undefined} onReset={() => setGroupField('idle', 'timeoutSeconds', undefined)} disabled={readOnly} />
                </span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={KIOSK_LIMITS.idleSecondsMin}
                  max={KIOSK_LIMITS.idleSecondsMax}
                  value={effective.idle.timeoutSeconds}
                  disabled={readOnly}
                  onChange={(event) => setGroupField('idle', 'timeoutSeconds', Number(event.target.value))}
                  className="min-h-10 tabular-nums"
                />
                <span className="text-caption text-muted-foreground">An unfinished order is cleared when the screen goes idle.</span>
              </label>
              <div className="flex flex-col gap-1 text-sm">
                <span className="flex items-center justify-between gap-2 font-medium">
                  Advertising <Origin overridden={draft.idle?.adsEnabled !== undefined} onReset={() => setGroupField('idle', 'adsEnabled', undefined)} disabled={readOnly} />
                </span>
                <label className="flex min-h-10 items-center gap-2">
                  <input type="checkbox" checked={effective.idle.adsEnabled} disabled={readOnly} onChange={(event) => setGroupField('idle', 'adsEnabled', event.target.checked)} />
                  Play scheduled ads on the idle screen
                </label>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(COPY_LABEL) as (keyof typeof COPY_LABEL)[]).map((key) => (
                <label key={key} className="flex flex-col gap-1 text-sm">
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {COPY_LABEL[key]} <Origin overridden={draft.copy?.[key] !== undefined} onReset={() => setGroupField('copy', key, undefined)} disabled={readOnly} />
                  </span>
                  <Input maxLength={KIOSK_LIMITS.copyMax[key]} value={effective.copy[key]} disabled={readOnly} onChange={(event) => setGroupField('copy', key, event.target.value)} className="min-h-10" />
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Languages</CardTitle>
            <p className="text-sm text-muted-foreground">With more than one, customers get a language switch at the top of the screen. It goes back to the starting language when their order ends.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-6">
              <div className="flex flex-col gap-1 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  Offered <Origin overridden={draft.language?.available !== undefined} onReset={() => setLanguage('available', undefined)} disabled={readOnly} />
                </span>
                <div className="flex gap-4">
                  {KIOSK_LOCALES.map((locale) => (
                    <label key={locale} className="flex min-h-10 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={effective.language.available.includes(locale)}
                        disabled={readOnly}
                        onChange={(event) =>
                          setLanguage(
                            'available',
                            event.target.checked ? KIOSK_LOCALES.filter((entry) => entry === locale || effective.language.available.includes(entry)) : effective.language.available.filter((entry) => entry !== locale),
                          )
                        }
                      />
                      {KIOSK_LOCALE_LABEL[locale]}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  Starting language <Origin overridden={draft.language?.default !== undefined} onReset={() => setLanguage('default', undefined)} disabled={readOnly} />
                </span>
                <select className="min-h-10 rounded-md border border-border bg-surface px-2" value={effective.language.default} disabled={readOnly} onChange={(event) => setLanguage('default', event.target.value as KioskLocale)}>
                  {effective.language.available.map((locale) => (
                    <option key={locale} value={locale}>
                      {KIOSK_LOCALE_LABEL[locale]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {KIOSK_TRANSLATABLE_LOCALES.filter((locale) => effective.language.available.includes(locale)).map((locale) => {
              const translation = effective.translations[locale] ?? {};
              return (
                <fieldset key={locale} className="flex flex-col gap-3 rounded-md border border-border p-3">
                  <legend className="px-1 text-sm font-medium">Wording in {KIOSK_LOCALE_LABEL[locale]}</legend>
                  <p className="text-caption text-muted-foreground">Blank shows the English. The screen’s own buttons and messages are already translated.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(Object.keys(COPY_LABEL) as (keyof typeof COPY_LABEL)[]).map((key) => (
                      <label key={key} className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">{COPY_LABEL[key]}</span>
                        <Input maxLength={KIOSK_LIMITS.copyMax[key]} placeholder={effective.copy[key]} value={translation.copy?.[key] ?? ''} disabled={readOnly} onChange={(event) => setTranslation(locale, ['copy', key], event.target.value)} className="min-h-10" />
                      </label>
                    ))}
                    {KIOSK_BADGE_STATES.filter((state) => effective.badges[state].visible).map((state) => (
                      <label key={state} className="flex flex-col gap-1 text-sm">
                        <span className="font-medium">“{effective.badges[state].label}” badge</span>
                        <Input maxLength={KIOSK_LIMITS.badgeLabelMax} placeholder={effective.badges[state].label} value={translation.badges?.[state] ?? ''} disabled={readOnly} onChange={(event) => setTranslation(locale, ['badges', state], event.target.value)} className="min-h-10" />
                      </label>
                    ))}
                    {effective.browseSections
                      .filter((section) => section.visible && (section.type === 'promo_message' || section.type === 'featured_products'))
                      .map((section) => {
                        const field = section.type === 'promo_message' ? 'text' : 'title';
                        const english = (section.type === 'promo_message' ? section.props.text : section.props.title) ?? '';
                        return (
                          <label key={section.id} className="flex flex-col gap-1 text-sm">
                            <span className="font-medium">{section.type === 'promo_message' ? 'Message strip' : 'Featured row title'}</span>
                            <Input
                              maxLength={field === 'text' ? KIOSK_LIMITS.promoTextMax : KIOSK_LIMITS.sectionTitleMax}
                              placeholder={english}
                              value={translation.sections?.[section.id]?.[field] ?? ''}
                              disabled={readOnly}
                              onChange={(event) => setTranslation(locale, ['sections', section.id, field], event.target.value)}
                              className="min-h-10"
                            />
                          </label>
                        );
                      })}
                  </div>
                </fieldset>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-6 xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Save and publish</CardTitle>
            <p className="text-sm text-muted-foreground">
              {liveVersionNumber ? `Version ${liveVersionNumber} is live.` : 'Nothing published here yet — these machines show the layer above.'} {dirty ? 'You have unsaved changes.' : ''}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {canDesign ? (
              <Button variant="outline" onClick={saveDraft} loading={busy === 'save'} disabled={Boolean(busy) || !dirty || parseProblems.length > 0}>
                Save draft
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">You can look at this design but not change it.</p>
            )}
            {canPublish ? (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">What changed?</span>
                  <Input value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Christmas colours" className="min-h-10" />
                </label>
                <Button onClick={publish} loading={busy === 'publish'} disabled={Boolean(busy) || !note.trim() || parseProblems.length > 0 || check.errors.length > 0 || (dirty && !canDesign)}>
                  Publish to machines
                </Button>
                {liveVersionNumber && scope !== 'global' ? (
                  <Button variant="ghost" size="sm" onClick={withdraw} loading={busy === 'withdraw'} disabled={Boolean(busy)}>
                    Stop using this layer
                  </Button>
                ) : null}
              </>
            ) : null}
            <Message result={result} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3">
            <CardTitle className="text-base">Preview</CardTitle>
            {previewMachines.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label="Preview on machine" className={`${selectClass} w-auto flex-1`} value={previewId} onChange={(event) => setPreviewId(event.target.value)}>
                  {previewMachines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.code} · {machine.widthPx}×{machine.heightPx}
                      {machine.profileSet ? '' : ' (assumed)'}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant={previewIdle ? 'primary' : 'outline'} onClick={() => setPreviewIdle((idle) => !idle)} aria-pressed={previewIdle}>
                  Idle screen
                </Button>
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {previewMachine ? (
              <>
                <div className="mx-auto overflow-hidden rounded-lg border border-border bg-background" style={{ width: frameWidth * scale, height: frameHeight * scale }}>
                  <iframe
                    key={`${previewId}-${previewIdle}-${previewKey}`}
                    title={`Preview of ${previewMachine.code}`}
                    src={`/kiosk-preview/${previewMachine.id}?scope=${scope}&scopeId=${encodeURIComponent(scopeId)}${previewIdle ? '&idle=1' : ''}`}
                    style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }}
                  />
                </div>
                <p className="mt-2 text-caption text-muted-foreground">Shows the saved draft{dirty ? ' — save to see your latest changes' : ''}. Payments are off in the preview.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No machine uses this layer yet, so there is nothing to preview on.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Version history</CardTitle>
          </CardHeader>
          <CardContent>
            {versions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing published yet.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-border">
                {versions.map((version) => (
                  <li key={version.versionNumber} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium tabular-nums">v{version.versionNumber}</span>
                      {version.versionNumber === liveVersionNumber ? <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-caption text-success">Live</span> : null}
                      <span className="block text-muted-foreground">
                        {version.note}
                        {version.publishedAt ? ` · ${new Intl.DateTimeFormat('en-KE', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(version.publishedAt))}` : ''}
                      </span>
                    </span>
                    {canPublish && version.versionNumber !== liveVersionNumber ? (
                      <Button size="sm" variant="ghost" onClick={() => rollback(version.versionNumber)} loading={busy === `rollback-${version.versionNumber}`} disabled={Boolean(busy)}>
                        Make live again
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

