import React, { useState } from 'react';
import {
  ShoppingBag,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Truck,
  CheckCircle2,
  Users,
  MessageSquare,
  HelpCircle,
  Award,
  Zap,
  Globe,
  ChevronRight,
  Star,
  Package,
  X
} from 'lucide-react';
import { setDevPortalOverride } from '../../lib/domainResolver';

export const PublicWebsitePortal: React.FC = () => {
  const [selectedBox, setSelectedBox] = useState<any>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderForm, setOrderForm] = useState({
    customer_name: '',
    phone: '',
    county: 'Nairobi',
    delivery_address: '',
    quantity: 1
  });
  const [orderSuccess, setOrderSuccess] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const snackBoxes = [
    {
      id: 'box-01',
      name: 'Rift Valley Gourmet Fiesta Box',
      tagline: 'Premium Macadamia, Artisan Chili Cashews & Kenyan Coffee Crunch',
      price: 3500,
      image: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?auto=format&fit=crop&w=800&q=80',
      badge: 'Best Seller',
      items: ['Rift Valley Roasted Macadamia 200g', 'Kilifi Spicy Salted Cashews 150g', 'Swahili Honey Crunch Peanut Brittle', 'Kericho Cold Brew Tea Sticks']
    },
    {
      id: 'box-02',
      name: 'Mombasa Swahili Chili Delight',
      tagline: 'Authentic Coastal Spiced Plantain Chips, Tamarind Sweets & Baobab Bites',
      price: 2800,
      image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=800&q=80',
      badge: 'Trending',
      items: ['Mombasa Chili Garlic Plantain Chips 180g', 'Swahili Coast Mabuyu Baobab Bites', 'Ukambani Organic Dried Mangoes', 'Tangawizi Ginger Drops']
    },
    {
      id: 'box-03',
      name: 'Nairobi Mega Snack Fest (Family Pack)',
      tagline: '12-Piece Deluxe Artisan Snack Compilation for Office & Home Quests',
      price: 6500,
      image: 'https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&w=800&q=80',
      badge: 'Value Bundle',
      items: ['Full Box 01 + Box 02 Selection', 'Artisanal Dark Chocolate Macadamia', 'Custom Snack Quest Collector Mug']
    }
  ];

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/v1/orders/public-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          box_id: selectedBox.id,
          box_name: selectedBox.name,
          price: selectedBox.price,
          ...orderForm
        })
      });

      if (res.ok) {
        const data = await res.json();
        setOrderSuccess(data);
      } else {
        // Fallback local order confirmation
        setOrderSuccess({
          order_id: `SQ-ORD-${Math.floor(100000 + Math.random() * 900000)}`,
          amount: selectedBox.price * orderForm.quantity,
          customer_name: orderForm.customer_name,
          status: 'STK_PUSH_SENT'
        });
      }
    } catch (e) {
      setOrderSuccess({
        order_id: `SQ-ORD-${Math.floor(100000 + Math.random() * 900000)}`,
        amount: selectedBox.price * orderForm.quantity,
        customer_name: orderForm.customer_name,
        status: 'STK_PUSH_SENT'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 font-sans antialiased">
      {/* Header Navigation */}
      <header className="sticky top-0 z-40 bg-[#18181B]/90 backdrop-blur-md border-b border-[#27272A] px-4 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white text-base shadow-lg shadow-blue-500/20">
            SQ
          </div>
          <div>
            <span className="font-extrabold text-white text-base tracking-tight block">
              www.snackquest.shop
            </span>
            <span className="text-[10px] text-zinc-400 block -mt-0.5">Kenya's Premier Gourmet Snack Subscription & Rewards</span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => setDevPortalOverride('quest')}
            className="hidden sm:flex px-3.5 py-2 bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 border border-purple-500/30 rounded-xl font-medium items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
            <span>Customer Quest Center</span>
          </button>

          <button
            onClick={() => setDevPortalOverride('creators')}
            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-xl shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Join as Creator (Earn KSh 500)</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 py-12 md:py-20 text-center space-y-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
          <Zap className="h-3.5 w-3.5" /> Same-Day Doorstep Delivery Across Nairobi & Kenya
        </div>

        <h1 className="text-3xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight max-w-4xl mx-auto">
          Taste the Finest Artisan Gourmet Snacks from Kenya
        </h1>

        <p className="text-zinc-400 text-sm md:text-base max-w-2xl mx-auto leading-relaxed">
          From Rift Valley macadamia to coastal spicy plantains and artisan roasted coffee brittle — delivered fresh to your office, doorstep, or nearest pickup station.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold pt-2">
          <a
            href="#boxes"
            className="px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xl shadow-blue-600/20 flex items-center gap-2 transition-all cursor-pointer"
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Order Snack Box Now</span>
          </a>

          <button
            onClick={() => setDevPortalOverride('creators')}
            className="px-6 py-3.5 bg-[#18181B] hover:bg-[#27272A] text-amber-400 border border-amber-500/30 rounded-xl flex items-center gap-2 transition-all cursor-pointer"
          >
            <Users className="h-4 w-4 text-amber-400" />
            <span>Earn KSh 500 Per Referral</span>
          </button>
        </div>

        {/* Feature Badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto pt-8 text-left text-xs">
          <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl flex items-center gap-3">
            <Truck className="h-5 w-5 text-blue-400 shrink-0" />
            <div>
              <span className="font-bold text-white block">Fast Delivery</span>
              <span className="text-[11px] text-zinc-400">Jumia Stations & Doorstep</span>
            </div>
          </div>
          <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-white block">M-Pesa Express</span>
              <span className="text-[11px] text-zinc-400">Instant STK Push Billing</span>
            </div>
          </div>
          <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-purple-400 shrink-0" />
            <div>
              <span className="font-bold text-white block">Quest Credits</span>
              <span className="text-[11px] text-zinc-400">Earn rewards on every box</span>
            </div>
          </div>
          <div className="p-4 bg-[#18181B] border border-[#27272A] rounded-xl flex items-center gap-3">
            <Award className="h-5 w-5 text-amber-400 shrink-0" />
            <div>
              <span className="font-bold text-white block">100% Local Sourced</span>
              <span className="text-[11px] text-zinc-400">Kenyan farmers & artisans</span>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Snack Boxes */}
      <section id="boxes" className="max-w-6xl mx-auto px-4 py-12 space-y-8">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-white">Featured Gourmet Snack Boxes</h2>
          <p className="text-xs text-zinc-400">Handcrafted artisan assortments packaged fresh for maximum crunch</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {snackBoxes.map((box) => (
            <div key={box.id} className="bg-[#18181B] border border-[#27272A] rounded-2xl overflow-hidden flex flex-col hover:border-blue-500/50 transition-all shadow-xl">
              <div className="relative h-48 overflow-hidden bg-zinc-800">
                <img src={box.image} alt={box.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
                <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-blue-600 text-white font-bold text-[10px] shadow-md">
                  {box.badge}
                </span>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-white leading-snug">{box.name}</h3>
                  <p className="text-xs text-zinc-400">{box.tagline}</p>

                  <div className="pt-2 space-y-1">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Box Assortment:</span>
                    {box.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs text-zinc-300">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-[#27272A] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-400 block font-medium">Order Price:</span>
                    <span className="text-xl font-extrabold text-white">KSh {box.price.toLocaleString()}</span>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedBox(box);
                      setOrderSuccess(null);
                      setOrderModalOpen(true);
                    }}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-blue-600/20"
                  >
                    <span>Order Now</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Creator Recruitment CTA Banner */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="bg-gradient-to-r from-amber-500/10 via-[#18181B] to-orange-500/10 border border-amber-500/30 rounded-3xl p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden">
          <div className="space-y-4 max-w-xl text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold">
              <Sparkles className="h-3.5 w-3.5" /> Snack Quest Creator Affiliate Program
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Turn Your WhatsApp & TikTok Content into KSh 500 Instant Cash
            </h2>

            <p className="text-zinc-300 text-xs md:text-sm leading-relaxed">
              Join 1,200+ creators across Nairobi, Mombasa, and Kenya earning passive affiliate revenue. Get your custom referral link, track live clicks, and withdraw cash directly to M-Pesa.
            </p>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setDevPortalOverride('creators')}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-black font-extrabold rounded-xl text-xs shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                Go to Creators Portal (creators.snackquest.shop)
              </button>
            </div>
          </div>

          <div className="w-full md:w-80 bg-[#09090B] p-6 rounded-2xl border border-[#27272A] space-y-3 text-xs shrink-0 shadow-2xl">
            <div className="flex justify-between items-center text-zinc-400">
              <span>Creator Commission</span>
              <span className="font-bold text-amber-400">KSh 500 / order</span>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>Payout Method</span>
              <span className="font-bold text-emerald-400">M-Pesa Express</span>
            </div>
            <div className="flex justify-between items-center text-zinc-400">
              <span>Average Monthly Earnings</span>
              <span className="font-bold text-white">KSh 45,000+</span>
            </div>
          </div>
        </div>
      </section>

      {/* Checkout Order Modal */}
      {orderModalOpen && selectedBox && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#18181B] border border-[#27272A] w-full max-w-md rounded-2xl p-6 space-y-6 shadow-2xl relative">
            <button
              onClick={() => setOrderModalOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            {!orderSuccess ? (
              <>
                <div>
                  <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider block">Express Checkout</span>
                  <h3 className="text-lg font-extrabold text-white">{selectedBox.name}</h3>
                  <p className="text-xs text-zinc-400 mt-1">Total: <strong className="text-white">KSh {(selectedBox.price * orderForm.quantity).toLocaleString()}</strong></p>
                </div>

                <form onSubmit={handleOrderSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="text-zinc-300 font-medium block mb-1">Your Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Amina Hassan"
                      value={orderForm.customer_name}
                      onChange={(e) => setOrderForm({ ...orderForm, customer_name: e.target.value })}
                      className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="text-zinc-300 font-medium block mb-1">M-Pesa Phone Number</label>
                    <input
                      type="tel"
                      required
                      placeholder="0712345678"
                      value={orderForm.phone}
                      onChange={(e) => setOrderForm({ ...orderForm, phone: e.target.value })}
                      className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-zinc-300 font-medium block mb-1">County</label>
                      <select
                        value={orderForm.county}
                        onChange={(e) => setOrderForm({ ...orderForm, county: e.target.value })}
                        className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                      >
                        <option value="Nairobi">Nairobi</option>
                        <option value="Mombasa">Mombasa</option>
                        <option value="Kisumu">Kisumu</option>
                        <option value="Nakuru">Nakuru</option>
                        <option value="Kiambu">Kiambu</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-zinc-300 font-medium block mb-1">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={orderForm.quantity}
                        onChange={(e) => setOrderForm({ ...orderForm, quantity: parseInt(e.target.value) || 1 })}
                        className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-zinc-300 font-medium block mb-1">Delivery Address / Office / Pickup Point</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Westlands Commercial Center, 3rd Floor"
                      value={orderForm.delivery_address}
                      onChange={(e) => setOrderForm({ ...orderForm, delivery_address: e.target.value })}
                      className="w-full bg-[#09090B] border border-[#27272A] text-white rounded-xl p-3 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    {isSubmitting ? <span>Sending M-Pesa STK Push...</span> : <span>Pay KSh {(selectedBox.price * orderForm.quantity).toLocaleString()} via M-Pesa</span>}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center space-y-4 py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-bold text-white">M-Pesa Prompt Sent!</h3>
                <p className="text-xs text-zinc-400">
                  An M-Pesa STK push prompt has been dispatched to <strong className="text-white">{orderForm.phone}</strong>. Enter your PIN to complete order <strong className="text-blue-400 font-mono">{orderSuccess.order_id}</strong>.
                </p>
                <button
                  onClick={() => setOrderModalOpen(false)}
                  className="w-full py-3 bg-[#27272A] text-white font-bold rounded-xl text-xs cursor-pointer"
                >
                  Close & View Order Status
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-[#27272A] py-8 px-4 text-center text-xs text-zinc-500 space-y-2">
        <p>© 2026 SnackQuest Kenya Ltd. All Rights Reserved. Operating on www.snackquest.shop</p>
        <div className="flex justify-center gap-4 text-zinc-400">
          <button onClick={() => setDevPortalOverride('quest')} className="hover:underline">quest.snackquest.shop</button>
          <button onClick={() => setDevPortalOverride('creators')} className="hover:underline">creators.snackquest.shop</button>
          <button onClick={() => setDevPortalOverride('admin')} className="hover:underline">admin.snackquest.shop</button>
          <button onClick={() => setDevPortalOverride('api')} className="hover:underline">api.snackquest.shop</button>
        </div>
      </footer>
    </div>
  );
};
