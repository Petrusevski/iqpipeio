import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import type { GuideStep } from "./OnboardingGuide";

interface Props {
  step:    GuideStep;
  onDone:  () => void;
}

export default function SectionIntroModal({ step, onDone }: Props) {
  const { Icon, iconColor, title, description, whatToDo, ctaLabel } = step;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Top accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400" />

          {/* Close */}
          <button
            onClick={onDone}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          >
            <X size={16} />
          </button>

          <div className="px-6 pt-6 pb-7 space-y-5">
            {/* Icon + title */}
            <div className="flex items-start gap-4">
              <div className="h-11 w-11 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                <Icon size={20} className={iconColor} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-1">Getting started</p>
                <h2 className="text-base font-bold text-white leading-snug">{title}</h2>
              </div>
            </div>

            {/* Description */}
            <p className="text-sm text-slate-300 leading-relaxed">{description}</p>

            {/* What to do */}
            <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 mb-1.5">What to do here</p>
              <p className="text-xs text-slate-300 leading-relaxed">{whatToDo}</p>
            </div>

            {/* CTA */}
            <button
              onClick={onDone}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all"
            >
              {ctaLabel}
              <ArrowRight size={14} />
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
