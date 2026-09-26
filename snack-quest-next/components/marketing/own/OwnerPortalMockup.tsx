import { Camera, LineChart, MapPin, Package, Radio } from 'lucide-react';

/**
 * A designed mockup of the real Snack Quest Owner Portal
 * (§ machine-owner lead-generation landing page, "use realistic
 * interface placeholders where the actual system isn't finished").
 * The portal itself is real and live (`/partner`), but this page is
 * public — showing an actual owner's real sales figures here would
 * leak one owner's business into a page every visitor can load. Every
 * label below is illustrative interface chrome, not a real number:
 * machine codes, connectivity dots and section names only.
 */
export function OwnerPortalMockup() {
  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.6)] sm:rounded-3xl">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-black/30 px-4 py-3 sm:px-5">
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="ml-3 text-xs font-medium text-white/40">Owner Portal · Dashboard</span>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2 sm:gap-4 sm:p-6">
        <MockCard icon={Package} label="Machines" accent="orange">
          <MockRow label="Machine 01" tag="Active" tagTone="lime" />
          <MockRow label="Machine 02" tag="Active" tagTone="lime" />
          <MockRow label="Machine 03" tag="Offline" tagTone="muted" />
        </MockCard>

        <MockCard icon={LineChart} label="Sales" accent="purple">
          <div className="mt-1 flex h-16 items-end gap-1.5" aria-hidden="true">
            {[40, 65, 50, 80, 60, 90, 70].map((height, index) => (
              <span key={index} className="from-secondary/70 to-secondary/20 flex-1 rounded-t-sm bg-gradient-to-t" style={{ height: `${height}%` }} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/35">Revenue · transactions · products sold</p>
        </MockCard>

        <MockCard icon={MapPin} label="Location" accent="lime">
          <p className="text-sm text-white/70">Machine status and placement, at a glance.</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-white/45">
            <span className="bg-home-lime size-2 rounded-full" />
            Online
          </div>
        </MockCard>

        <MockCard icon={Camera} label="Cameras" accent="orange">
          <div className="mt-1 aspect-video w-full rounded-lg border border-white/10 bg-black/50" />
          <p className="mt-2 text-[11px] text-white/35">Remote monitoring, per machine.</p>
        </MockCard>
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-5 py-3 text-xs text-white/40">
        <Radio className="size-3.5" aria-hidden="true" />
        Own one machine or several. Manage them from one place.
      </div>
    </div>
  );
}

function MockCard({
  icon: Icon,
  label,
  accent,
  children,
}: {
  icon: typeof Package;
  label: string;
  accent: 'orange' | 'purple' | 'lime';
  children: React.ReactNode;
}) {
  const ring = accent === 'orange' ? 'text-primary' : accent === 'purple' ? 'text-secondary' : 'text-home-lime';
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`size-4 ${ring}`} aria-hidden="true" />
        <span className="text-xs font-bold tracking-[0.14em] text-white/70 uppercase">{label}</span>
      </div>
      {children}
    </div>
  );
}

function MockRow({ label, tag, tagTone }: { label: string; tag: string; tagTone: 'lime' | 'muted' }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-2 text-sm last:border-0">
      <span className="text-white/75">{label}</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
          tagTone === 'lime' ? 'bg-home-lime/15 text-home-lime' : 'bg-white/10 text-white/40'
        }`}
      >
        {tag}
      </span>
    </div>
  );
}
