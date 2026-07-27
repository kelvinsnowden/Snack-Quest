import React, { useState } from 'react';
import {
  X,
  ExternalLink,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Image as ImageIcon,
  Camera
} from 'lucide-react';

interface QuestSubmitModalProps {
  quest: any;
  customerId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function QuestSubmitModal({ quest, customerId, onClose, onSuccess }: QuestSubmitModalProps) {
  const [proofUrl, setProofUrl] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);

  // Preset sample screenshot links for instant testing
  const sampleScreenshots = [
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80'
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setProofUrl(result || sampleScreenshots[0]);
      setUploadingFile(false);
    };
    reader.onerror = () => {
      setUploadingFile(false);
      setError('Failed to read photo from device.');
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const finalProofUrl = proofUrl.trim() || sampleScreenshots[0];

    fetch('/api/v1/customer/portal/submit-quest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        reward_type_id: quest.id,
        proof_url: finalProofUrl,
        notes
      })
    })
      .then((res) => res.json())
      .then((data) => {
        setSubmitting(false);
        if (data.success) {
          onSuccess();
        } else {
          setError(data.error || 'Failed to submit quest proof');
        }
      })
      .catch((err) => {
        setSubmitting(false);
        setError('Network error submitting quest proof');
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
              ⚡
            </div>
            <div>
              <h3 className="font-bold text-white text-base">{quest.title}</h3>
              <p className="text-xs text-amber-400 font-semibold">
                Earn +{quest.credit_value_kes.toLocaleString()} KES Quest Credits
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Action Platform Button */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <span className="text-[10px] font-bold uppercase text-amber-400 tracking-wider block mb-1">
              Step 1: Perform Quest Action
            </span>
            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              {quest.description}
            </p>
            {quest.external_platform_url && quest.external_platform_url !== '#referral' && (
              <a
                href={quest.external_platform_url}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all"
              >
                <span>{quest.platform_button_label || 'Open External Platform'}</span>
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
              </a>
            )}
          </div>

          {/* Step 2: Proof Upload / Link */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              Step 2: Take Photo or Paste Proof Screenshot URL
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              Snap a screenshot or review photo using your phone camera, or paste a link:
            </p>

            {/* Native Camera Upload Button */}
            <div className="mb-3">
              <label className="w-full py-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-700 text-amber-300 font-bold text-xs rounded-xl border border-amber-500/30 flex items-center justify-center gap-2 cursor-pointer transition-all min-h-[44px]">
                <Camera className="w-4 h-4 text-amber-400" />
                <span>{uploadingFile ? 'Processing Photo...' : 'Capture Photo or Choose Screenshot'}</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="relative">
              <ImageIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="https://images.unsplash.com/photo-..."
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* Quick Sample Selector */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] text-slate-500 font-semibold">Quick Sample:</span>
              <button
                type="button"
                onClick={() => setProofUrl(sampleScreenshots[0])}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-1 rounded border border-slate-700 min-h-[28px]"
              >
                Sample 1
              </button>
              <button
                type="button"
                onClick={() => setProofUrl(sampleScreenshots[1])}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-1 rounded border border-slate-700 min-h-[28px]"
              >
                Sample 2
              </button>
            </div>
          </div>

          {/* Step 3: Optional Notes */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              Step 3: Social Handle / Comment Link (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. My TikTok handle is @wanjiku_snacks or review posted on Google under Wanjiku M."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>{submitting ? 'Submitting Proof...' : 'Submit Quest Proof'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
