import React, { useState } from 'react';
import { X, QrCode, Camera, CheckCircle2, Upload, AlertCircle, Copy } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  referralCode: string;
  referralLink: string;
}

export default function QRCodeModal({ isOpen, onClose, referralCode, referralLink }: QRCodeModalProps) {
  const [activeTab, setActiveTab] = useState<'share' | 'scan'>('share');
  const [cameraActive, setCameraActive] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);

  if (!isOpen) return null;

  // Generate SVG QR Code representation for referral link
  const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(referralLink)}&color=f59e0b&bgboundary=020617`;

  const handleSimulateScan = () => {
    setCameraActive(true);
    setTimeout(() => {
      setCameraActive(false);
      setScanSuccess(true);
      setTimeout(() => {
        setScanSuccess(false);
      }, 3000);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-sm">QR Code Center</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-slate-950">
          <button
            onClick={() => setActiveTab('share')}
            className={`flex-1 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'share' ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-900/50' : 'text-slate-400'
            }`}
          >
            My Referral QR Code
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex-1 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'scan' ? 'text-amber-400 border-b-2 border-amber-400 bg-slate-900/50' : 'text-slate-400'
            }`}
          >
            Scan Quest QR
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center space-y-4">
          {activeTab === 'share' ? (
            <div className="space-y-4 flex flex-col items-center">
              <div className="p-3 bg-slate-950 border border-amber-500/30 rounded-2xl shadow-xl">
                <img
                  src={qrSvgUrl}
                  alt="Referral QR Code"
                  className="w-48 h-48 object-contain rounded-xl"
                  onError={(e: any) => {
                    e.target.src = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=snackquests.shop';
                  }}
                />
              </div>

              <div>
                <p className="text-xs text-slate-300 font-medium">Have your friend scan this QR code directly</p>
                <p className="text-[11px] text-amber-400 font-mono font-bold mt-1">Code: {referralCode}</p>
              </div>

              <a
                href={qrSvgUrl}
                download="snackquest-qr.png"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2"
              >
                <span>Save QR Code Image</span>
              </a>
            </div>
          ) : (
            <div className="space-y-4 flex flex-col items-center">
              {scanSuccess ? (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-xs flex flex-col items-center gap-2 w-full">
                  <CheckCircle2 className="w-8 h-8" />
                  <span className="font-bold">Quest Check-In QR Verified!</span>
                  <p className="text-[11px] text-slate-300 text-center">
                    Successfully scanned Snack Quest partner kiosk code. +150 KES bonus registered.
                  </p>
                </div>
              ) : cameraActive ? (
                <div className="relative w-full h-48 bg-slate-950 rounded-2xl border-2 border-dashed border-amber-500 flex flex-col items-center justify-center overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-amber-500/20 via-transparent to-amber-500/20 animate-pulse" />
                  <Camera className="w-8 h-8 text-amber-400 animate-bounce mb-2" />
                  <span className="text-xs font-bold text-amber-300">Scanning Camera Feed...</span>
                  <span className="text-[10px] text-slate-400 mt-1">Align QR code within frame</span>
                </div>
              ) : (
                <div className="w-full bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
                  <Camera className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-xs text-slate-300">
                    Scan Quest posters or in-store QR codes at partner locations across Nairobi to claim instant Quest Credits.
                  </p>
                  <button
                    onClick={handleSimulateScan}
                    className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg transition-all"
                  >
                    Open Device Camera Scanner
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
