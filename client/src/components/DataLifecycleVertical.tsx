import { motion } from "framer-motion";
import { 
  FileJson, 
  Fingerprint, 
  Send, 
  RefreshCw, 
  CheckCircle2 
} from "lucide-react";

// 1. Define the stages of the data lifecycle
const steps = [
  {
    id: "import",
    title: "Data Ingestion",
    description: "Raw prospect data arrives via Webhook or CSV upload.",
    icon: FileJson,
    color: "bg-blue-500",
    code: `{
  "email": "ceo@c6f4b2.com",
  "name": "John Doe",
  "source": "Clay"
}`
  },
  {
    id: "identity",
    title: "Identity Resolution",
    description: "iqpipe mints a unique, immutable ID for this prospect.",
    icon: Fingerprint,
    color: "bg-fuchsia-500",
    code: `{
  "email": "ceo@c6f4b2.com",
  "iqpipe_id": "IQP_8821_X",
  "status": "new"
}`
  },
  {
    id: "outbound",
    title: "Outbound Orchestration",
    description: "Data is pushed to SmartLead/Instantly with the ID attached.",
    icon: Send,
    color: "bg-indigo-500",
    code: `POST /smartlead/v1/leads
{
  "email": "...",
  "custom_field_1": "REV_8821_X"
}`
  },
  {
    id: "feedback",
    title: "State Reconciliation",
    description: "When a reply happens, the tool sends a webhook back. We match the ID.",
    icon: RefreshCw,
    color: "bg-emerald-500",
    code: `WEBHOOK RECEIVED:
{
  "event": "REPLY_DETECTED",
  "id_ref": "REV_8821_X",
  "new_stage": "interested"
}`
  }
];

export default function DataLifecycleVertical() {
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-12">
      <div className="relative">
        {/* The main vertical line running through the background */}
        <div className="absolute left-6 md:left-8 top-4 bottom-4 w-0.5 bg-slate-800" />

        {steps.map((step, index) => (
          <LifecycleNode key={step.id} step={step} index={index} />
        ))}

        {/* Final Success Indicator */}
        <motion.div 
           initial={{ opacity: 0, scale: 0 }}
           whileInView={{ opacity: 1, scale: 1 }}
           viewport={{ once: true }}
           transition={{ delay: steps.length * 1.5, type: "spring" }}
           className="relative z-10 flex items-center gap-4 mt-8"
        >
           <div className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center shadow-xl shadow-emerald-900/20">
              <CheckCircle2 className="text-emerald-400 w-6 h-6" />
           </div>
           <div className="text-emerald-400 font-mono text-sm">Lifecycle Complete</div>
        </motion.div>
      </div>
    </div>
  );
}

function LifecycleNode({ step, index }: { step: typeof steps[0]; index: number }) {
  const isLast = index === steps.length - 1;

  return (
    <div className="relative mb-12 last:mb-0 pl-20 md:pl-24">
      
      {/* Animated Connection Line (The colored beam that travels down) */}
      {!isLast && (
        <motion.div
          initial={{ height: 0 }}
          whileInView={{ height: "100%" }}
          viewport={{ once: true }}
          transition={{ 
            delay: (index * 1.5) + 0.5, // Wait for node to appear, then draw line
            duration: 1, 
            ease: "linear" 
          }}
          className="absolute left-6 md:left-8 top-12 w-0.5 bg-gradient-to-b from-indigo-500 via-fuchsia-500 to-indigo-500 z-0"
        />
      )}

      {/* The Icon/Node Circle */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: index * 1.5, duration: 0.5 }}
        className="absolute left-0 top-0 w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-slate-900 border border-slate-700 flex items-center justify-center z-10 shadow-[0_0_15px_-3px_rgba(0,0,0,0.5)]"
      >
        <div className={`absolute inset-0 rounded-2xl opacity-20 ${step.color} blur-md`} />
        <step.icon className="text-slate-200 w-5 h-5 md:w-6 md:h-6 relative z-10" />
        
        {/* Small pulsating dot to show activity */}
        <div className="absolute -right-1 -top-1 w-3 h-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${step.color}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${step.color}`}></span>
        </div>
      </motion.div>

      {/* The Content Card */}
      <motion.div
        initial={{ x: 50, opacity: 0 }}
        whileInView={{ x: 0, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: (index * 1.5) + 0.2, duration: 0.5 }}
        className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 backdrop-blur-sm hover:border-slate-600 transition-colors group"
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          {/* Text Info */}
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-100 mb-1 flex items-center gap-2">
              {step.title}
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              {step.description}
            </p>
          </div>

          {/* Code Snippet Visualization */}
          <div className="w-full md:w-64 shrink-0">
            <div className="rounded-lg bg-slate-950 border border-slate-800 p-3 font-mono text-[10px] text-slate-300 overflow-hidden relative">
               {/* Syntax Highlighting Simulation */}
               <pre className="whitespace-pre-wrap break-all">
                 <span className="text-slate-500">{'// Payload State'}</span>
                 <br />
                 {step.code}
               </pre>
               {/* Code glow effect */}
               <div className={`absolute top-0 right-0 w-20 h-20 bg-gradient-to-br ${step.color} opacity-10 blur-xl rounded-full -translate-y-1/2 translate-x-1/2`} />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}