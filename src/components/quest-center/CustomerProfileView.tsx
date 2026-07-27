import React, { useState } from 'react';
import { User, Save, CheckCircle2, ShieldCheck, Mail, Phone, MapPin, Bell, Heart } from 'lucide-react';

interface CustomerProfileViewProps {
  customer: any;
  onProfileUpdated: () => void;
}

export default function CustomerProfileView({ customer, onProfileUpdated }: CustomerProfileViewProps) {
  const [fullName, setFullName] = useState<string>(customer?.full_name || '');
  const [phone, setPhone] = useState<string>(customer?.phone || '');
  const [email, setEmail] = useState<string>(customer?.email || '');
  const [county, setCounty] = useState<string>(customer?.county || 'Nairobi');
  const [town, setTown] = useState<string>(customer?.town || 'Westlands');
  const [deliveryAddress, setDeliveryAddress] = useState<string>(customer?.delivery_address || '');

  // Preferences
  const [favouriteCategories, setFavouriteCategories] = useState<string[]>(
    customer?.favourite_categories || ['Chips & Savory', 'Biscuits & Chocolate']
  );
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>(
    customer?.dietary_preferences || ['Halal Friendly']
  );

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  const allCategories = ['Chips & Savory', 'Biscuits & Chocolate', 'Gummies & Sweets', 'Japanese Imports', 'Mexican Spicy'];
  const allDietary = ['Halal Friendly', 'Vegetarian', 'Gluten-Free', 'Nut-Free'];

  const toggleCategory = (cat: string) => {
    setFavouriteCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleDietary = (diet: string) => {
    setDietaryPreferences((prev) =>
      prev.includes(diet) ? prev.filter((d) => d !== diet) : [...prev, diet]
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSavedSuccess(false);

    fetch(`/api/v1/customer/portal/profile/${customer.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: fullName,
        phone,
        email,
        county,
        town,
        delivery_address: deliveryAddress,
        favourite_categories: favouriteCategories,
        dietary_preferences: dietaryPreferences
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setSubmitting(false);
        if (data.success) {
          setSavedSuccess(true);
          onProfileUpdated();
          setTimeout(() => setSavedSuccess(false), 3000);
        }
      })
      .catch((err) => {
        console.error('Failed to update profile', err);
        setSubmitting(false);
      });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Customer Profile & Snack Preferences</h2>
            <p className="text-xs text-slate-400">
              Manage your delivery details, favorite snack categories, and dietary choices.
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Contact & Delivery Details */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <MapPin className="w-4 h-4 text-amber-400" />
            <span>Contact & Fulfillment Details</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="text-slate-400 font-semibold block mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-semibold block mb-1">Phone Number (M-Pesa / Delivery)</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-semibold block mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-semibold block mb-1">County</label>
              <input
                type="text"
                value={county}
                onChange={(e) => setCounty(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-semibold block mb-1">Town / Estate</label>
              <input
                type="text"
                value={town}
                onChange={(e) => setTown(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="text-slate-400 font-semibold block mb-1">Delivery Street / Building Address</label>
              <input
                type="text"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Snack & Dietary Preferences */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <Heart className="w-4 h-4 text-amber-400" />
            <span>Snack Taste Profile</span>
          </h3>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-2">Favorite Snack Categories</label>
            <div className="flex flex-wrap gap-2">
              {allCategories.map((cat) => {
                const selected = favouriteCategories.includes(cat);
                return (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      selected
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 block mb-2">Dietary Restrictions</label>
            <div className="flex flex-wrap gap-2">
              {allDietary.map((diet) => {
                const selected = dietaryPreferences.includes(diet);
                return (
                  <button
                    type="button"
                    key={diet}
                    onClick={() => toggleDietary(diet)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      selected
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {diet}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-between">
          {savedSuccess ? (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Profile details saved successfully!</span>
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{submitting ? 'Saving...' : 'Save Profile Preferences'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
