/**
 * A designed illustration of a Discovery Machine, not a photograph
 * (§ machine-owner lead-generation landing page: "No cheesy stock
 * photos"). There is no real product photography of the physical
 * machine in this codebase to show honestly, and a generic stock
 * vending-machine photo would work directly against the page's own
 * point — "this isn't a vending machine I'm buying" — so the machine
 * is rendered instead, the way a premium hardware brand renders a
 * product it hasn't photographed yet: a clean silhouette, a lit
 * display, and a grid of illuminated product windows.
 */
export function DiscoveryMachineGraphic({ className }: { className?: string }) {
  const slots = Array.from({ length: 24 }, (_, index) => index);

  return (
    <div className={`relative ${className ?? ''}`}>
      <div
        aria-hidden="true"
        className="bg-primary/25 pointer-events-none absolute inset-x-0 top-1/3 mx-auto size-[70%] rounded-full blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="bg-secondary/20 pointer-events-none absolute inset-x-0 -bottom-10 mx-auto size-[55%] rounded-full blur-[90px]"
      />

      <div className="relative mx-auto flex w-full max-w-[300px] flex-col overflow-hidden rounded-[2rem] border border-white/15 bg-gradient-to-b from-[#1c1c1c] to-[#0a0a0a] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.7)] sm:max-w-[340px]">
        {/* Top brand strip */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <span className="text-[10px] font-bold tracking-[0.3em] text-white/50 uppercase">Snack Quest</span>
          <span className="bg-home-lime size-1.5 rounded-full" aria-hidden="true" />
        </div>

        {/* Display */}
        <div className="mx-4 mt-4 rounded-xl border border-white/10 bg-black/60 p-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg text-white">A12</span>
            <span className="text-primary text-xs font-bold tracking-wide">KES 100</span>
          </div>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <span className="from-primary to-home-orange-glow block h-full w-2/3 rounded-full bg-gradient-to-r" />
          </div>
        </div>

        {/* Product window — a grid of illuminated slots */}
        <div className="grid grid-cols-6 gap-1.5 px-4 py-5">
          {slots.map((slot) => {
            const lit = slot % 5 !== 0;
            return (
              <span
                key={slot}
                aria-hidden="true"
                className={`aspect-square rounded-[3px] ${
                  lit ? 'bg-gradient-to-b from-white/25 to-white/5' : 'bg-black/60'
                } border border-white/10`}
                style={lit ? { animationDelay: `${(slot % 6) * 140}ms` } : undefined}
              />
            );
          })}
        </div>

        {/* Dispense tray */}
        <div className="mx-4 mb-5 flex items-center justify-center rounded-lg border border-white/10 bg-black/40 py-3">
          <span className="h-1 w-16 rounded-full bg-white/15" aria-hidden="true" />
        </div>

        {/* Base */}
        <div className="h-3 bg-black/80" aria-hidden="true" />
      </div>
    </div>
  );
}
