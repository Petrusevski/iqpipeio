/**
 * TourGuide — reusable on-screen spotlight tour engine.
 * Accepts a list of steps and renders a spotlight + tooltip overlay.
 */
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { X, ArrowRight, ArrowLeft, Check } from "lucide-react";

export interface TourStep {
  selector: string | null;   // CSS selector for the target element; null = centered card
  title: string;
  desc: string;
  Icon: React.ElementType;
  iconGrad: string;          // Tailwind gradient classes e.g. "from-indigo-700 to-indigo-500"
  tip?: string;
  actionLabel?: string;
  actionPath?: string;       // navigates + closes the tour when clicked
}

interface TourGuideProps {
  steps: TourStep[];
  onClose: () => void;
  storageKey?: string;       // if set, writes "true" to localStorage on complete
}

// ── Constants ────────────────────────────────────────────────────────────────
const SPOT_PAD = 10;
const TIP_W    = 310;
const TIP_GAP  = 18;

// ── Spotlight — 4 dark rectangles leaving a transparent "hole" ───────────────
interface Rect { top: number; left: number; width: number; height: number; }

function Spotlight({ rect }: { rect: Rect }) {
  const { top, left, width, height } = rect;
  const base: React.CSSProperties = {
    position: "fixed", zIndex: 210, background: "rgba(0,0,0,0.76)", pointerEvents: "none",
  };
  return (
    <>
      <div style={{ ...base, inset: "0 0 auto 0", height: top }} />
      <div style={{ ...base, inset: `${top + height}px 0 0 0` }} />
      <div style={{ ...base, top, left: 0, width: left, height }} />
      <div style={{ ...base, top, left: left + width, right: 0, height }} />
      {/* Indigo ring */}
      <div style={{
        position: "fixed", zIndex: 211, pointerEvents: "none",
        top, left, width, height,
        borderRadius: 12,
        boxShadow: "0 0 0 2px rgba(99,102,241,0.9), 0 0 0 6px rgba(99,102,241,0.15), 0 0 28px rgba(99,102,241,0.3)",
      }} />
    </>
  );
}

// ── Tooltip card ─────────────────────────────────────────────────────────────
interface TooltipProps {
  step: TourStep;
  stepIdx: number;
  total: number;
  rect: Rect | null;
  onBack: () => void;
  onNext: () => void;
  onClose: () => void;
  onAction: (path: string) => void;
  isLast: boolean;
}

function Tooltip({ step, stepIdx, total, rect, onBack, onNext, onClose, onAction, isLast }: TooltipProps) {
  const { Icon, iconGrad, title, desc, tip, actionLabel, actionPath } = step;
  const isFirst  = stepIdx === 0;
  const centered = !rect;

  let style: React.CSSProperties;
  if (centered) {
    style = {
      position: "fixed", top: "50%", left: "50%",
      transform: "translate(-50%,-50%)",
      width: TIP_W + 40, zIndex: 215,
    };
  } else {
    const midY           = rect.top + rect.height / 2;
    const estH           = 290;
    let top              = Math.max(16, midY - estH / 2);
    if (top + estH > window.innerHeight - 16) top = window.innerHeight - estH - 16;
    let left             = rect.left + rect.width + TIP_GAP;
    if (left + TIP_W > window.innerWidth - 16) left = rect.left - TIP_W - TIP_GAP;
    style = { position: "fixed", top, left, width: TIP_W, zIndex: 215 };
  }

  return (
    <div style={style} className="rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl shadow-black/70 overflow-hidden">
      {/* Gradient header */}
      <div className={`bg-gradient-to-r ${iconGrad} px-4 py-3.5 flex items-center gap-3`}>
        <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm leading-tight">{title}</p>
          <p className="text-white/55 text-[10px] mt-0.5">Step {stepIdx + 1} of {total}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/25 transition-colors shrink-0"
          title="End tour"
        >
          <X size={12} className="text-white/80" />
        </button>
      </div>

      {/* Body */}
      <div className="px-4 pt-3.5 pb-1 space-y-3">
        <p className="text-[13px] text-slate-300 leading-relaxed">{desc}</p>

        {tip && (
          <div className="flex items-start gap-2 px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-700/60">
            <span className="text-[10px] font-bold text-indigo-400 shrink-0 mt-0.5 tracking-wide">TIP</span>
            <p className="text-[11px] text-slate-400 leading-relaxed">{tip}</p>
          </div>
        )}

        {actionLabel && actionPath && (
          <button
            onClick={() => onAction(actionPath)}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <ArrowRight size={12} /> {actionLabel}
          </button>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1 pt-3 pb-1">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className={`rounded-full transition-all duration-300 ${
            i === stepIdx ? "w-4 h-1.5 bg-indigo-400" :
            i < stepIdx  ? "w-1.5 h-1.5 bg-indigo-700" :
                            "w-1.5 h-1.5 bg-slate-700"
          }`} />
        ))}
      </div>

      {/* Nav footer */}
      <div className="flex items-center justify-between px-4 pt-2 pb-4">
        <button
          onClick={onBack}
          disabled={isFirst}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 disabled:opacity-25 disabled:pointer-events-none transition-colors"
        >
          <ArrowLeft size={12} /> Back
        </button>

        {isLast ? (
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-md shadow-indigo-500/20"
          >
            <Check size={12} /> Done
          </button>
        ) : (
          <button
            onClick={onNext}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
          >
            Next <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Engine ───────────────────────────────────────────────────────────────────
export default function TourGuide({ steps, onClose, storageKey }: TourGuideProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [spotRect, setSpotRect] = useState<Rect | null>(null);
  const [visible, setVisible] = useState(false);
  const navigate   = useNavigate();
  const rafRef     = useRef<number>();
  const touchStartX = useRef<number | null>(null);

  const step   = steps[stepIdx];
  const total  = steps.length;
  const isLast = stepIdx === total - 1;

  // ── Lock body scroll while tour is open ──────────────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Measure spotlight target ──────────────────────────────────────────────
  useLayoutEffect(() => {
    setVisible(false);
    if (!step.selector) {
      setSpotRect(null);
      setVisible(true);
      return;
    }
    const measure = () => {
      const el = document.querySelector(step.selector as string);
      if (el) {
        const r = el.getBoundingClientRect();
        setSpotRect({
          top:    r.top    - SPOT_PAD,
          left:   r.left   - SPOT_PAD,
          width:  r.width  + SPOT_PAD * 2,
          height: r.height + SPOT_PAD * 2,
        });
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        setSpotRect(null);
      }
      setVisible(true);
    };
    rafRef.current = requestAnimationFrame(measure);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!step.selector) return;
    const onResize = () => {
      const el = document.querySelector(step.selector as string);
      if (!el) return;
      const r = el.getBoundingClientRect();
      setSpotRect({
        top:    r.top    - SPOT_PAD,
        left:   r.left   - SPOT_PAD,
        width:  r.width  + SPOT_PAD * 2,
        height: r.height + SPOT_PAD * 2,
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [stepIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard navigation ───────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setStepIdx(i => (i < total - 1 ? i + 1 : i));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setStepIdx(i => Math.max(0, i - 1));
      } else if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Touch swipe navigation ────────────────────────────────────────────────
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 40) return; // ignore tiny swipes
    if (dx < 0) setStepIdx(i => (i < total - 1 ? i + 1 : i)); // swipe left → next
    else         setStepIdx(i => Math.max(0, i - 1));            // swipe right → back
    touchStartX.current = null;
  };

  const handleClose = () => {
    if (storageKey) localStorage.setItem(storageKey, "true");
    onClose();
  };

  const handleAction = (path: string) => {
    if (storageKey) localStorage.setItem(storageKey, "true");
    navigate(path);
    onClose();
  };

  const next = () => { if (isLast) handleClose(); else setStepIdx(i => i + 1); };
  const back = () => setStepIdx(i => Math.max(0, i - 1));

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[200]"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Full-screen backdrop — always present to block interaction with the app */}
      <div
        className="absolute inset-0 bg-black/80"
        onClick={handleClose}
      />

      {spotRect && <Spotlight rect={spotRect} />}

      <Tooltip
        step={step}
        stepIdx={stepIdx}
        total={total}
        rect={spotRect}
        onBack={back}
        onNext={next}
        onClose={handleClose}
        onAction={handleAction}
        isLast={isLast}
      />
    </div>
  );
}
