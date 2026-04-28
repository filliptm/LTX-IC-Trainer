import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";

import { useProject, useUpdateProject } from "@/api/projects";
import { useUIStore } from "@/stores/uiStore";

import { BasicSection } from "./sections/BasicSection";
import { LoRASection } from "./sections/LoRASection";
import { OptimizerSection } from "./sections/OptimizerSection";
import { ScheduleSection } from "./sections/ScheduleSection";
import {
  MemoryVramSection,
  MemoryQuantSection,
  MemoryAttnSection,
  MemoryCompileSection,
  MemoryGemmaSection,
} from "./sections/MemorySection";
import { SamplingSection } from "./sections/SamplingSection";
import { ValidationSection } from "./sections/ValidationSection";
import {
  ResearchCrepaSection,
  ResearchSelfFlowSection,
  ResearchHfatoSection,
  ResearchPreservationSection,
  ResearchTarpSection,
  ResearchAudioLossSection,
  ResearchAudioMetricsSection,
  ResearchModalitySection,
  ResearchCtsSection,
  ResearchAudioSupSection,
} from "./sections/ResearchFeaturesSection";

import { HyperparameterSidebar, type SectionNavGroup, type SectionNavItem } from "./HyperparameterSidebar";
import { TrainingActionRail } from "./TrainingActionRail";
import { EssentialsGrid } from "./EssentialsGrid";

type GroupTitle = "Essentials" | "Advanced" | "Research";

interface SectionDef {
  id: string;
  label: string;
  groupTitle: GroupTitle;
  /** Optional parent label. Renders a non-clickable header above this leaf in the sidebar. */
  parentLabel?: string;
  Component: React.ComponentType;
  /** Fields inside this section, used for fuzzy search. */
  fields: { id: string; label: string }[];
  /** If set, the sidebar shows an on/off dot from this boolean form field. */
  toggleField?: string;
}

// Flat list of every leaf tab. Order within group defines sidebar order.
const SECTIONS: SectionDef[] = [
  // ─── Essentials ─────────────────────────────────────────────
  {
    id: "basic",
    label: "Model & paths",
    groupTitle: "Essentials",
    Component: BasicSection,
    fields: [
      { id: "training.ltx2_checkpoint", label: "LTX-2 checkpoint" },
      { id: "training.gemma_root", label: "Gemma root" },
      { id: "training.gemma_safetensors", label: "Gemma safetensors" },
      { id: "training.ltx2_mode", label: "Mode (video / audio / av)" },
      { id: "training.ltx_version", label: "LTX version" },
      { id: "training.output_dir", label: "Output directory" },
      { id: "training.output_name", label: "Output name" },
      { id: "training.mixed_precision", label: "Mixed precision" },
    ],
  },
  {
    id: "lora",
    label: "LoRA / network",
    groupTitle: "Essentials",
    Component: LoRASection,
    fields: [
      { id: "training.network_module", label: "Network module" },
      { id: "training.network_dim", label: "Network dim (rank)" },
      { id: "training.network_alpha", label: "Network alpha" },
      { id: "training.lora_target_preset", label: "LoRA target preset" },
      { id: "training.ic_lora_strategy", label: "IC-LoRA strategy" },
      { id: "training.network_dropout", label: "Network dropout" },
      { id: "training.scale_weight_norms", label: "Scale weight norms" },
      { id: "training.network_args", label: "Network args" },
      { id: "training.network_weights", label: "Network weights (resume)" },
      { id: "training.train_connectors", label: "Train connectors" },
      { id: "training.lycoris_config", label: "LyCORIS config" },
      { id: "training.lycoris_quantized_base_check_mode", label: "LyCORIS quant check" },
    ],
  },
  {
    id: "optimizer",
    label: "Optimizer",
    groupTitle: "Essentials",
    Component: OptimizerSection,
    fields: [
      { id: "training.optimizer_type", label: "Optimizer type" },
      { id: "training.learning_rate", label: "Learning rate" },
      { id: "training.audio_lr", label: "Audio learning rate" },
      { id: "training.optimizer_args", label: "Optimizer args" },
      { id: "training.lr_scheduler", label: "LR scheduler" },
      { id: "training.lr_warmup_steps", label: "Warmup steps" },
      { id: "training.lr_decay_steps", label: "LR decay steps" },
      { id: "training.gradient_accumulation_steps", label: "Gradient accumulation" },
      { id: "training.max_grad_norm", label: "Max grad norm (clipping)" },
    ],
  },
  {
    id: "schedule",
    label: "Schedule & checkpointing",
    groupTitle: "Essentials",
    Component: ScheduleSection,
    fields: [
      { id: "training.max_train_steps", label: "Max train steps" },
      { id: "training.max_train_epochs", label: "Max train epochs" },
      { id: "training.save_every_n_steps", label: "Save every N steps" },
      { id: "training.save_every_n_epochs", label: "Save every N epochs" },
      { id: "training.timestep_sampling", label: "Timestep sampling" },
      { id: "training.discrete_flow_shift", label: "Discrete flow shift" },
      { id: "training.weighting_scheme", label: "Weighting scheme" },
      { id: "training.loss_type", label: "Loss type" },
      { id: "training.seed", label: "Seed" },
    ],
  },

  // ─── Advanced (flat items first, then Memory & performance children) ─
  {
    id: "sampling",
    label: "Sampling",
    groupTitle: "Advanced",
    Component: SamplingSection,
    fields: [
      { id: "training.sample_every_n_steps", label: "Sample every N steps" },
      { id: "training.sample_every_n_epochs", label: "Sample every N epochs" },
      { id: "training.sample_at_first", label: "Sample at first" },
      { id: "training.sample_prompts", label: "Sample prompts" },
      { id: "training.height", label: "Sample height" },
      { id: "training.width", label: "Sample width" },
      { id: "training.sample_num_frames", label: "Sample num frames" },
      { id: "training.sample_tiled_vae", label: "Tiled VAE for samples" },
      { id: "training.sample_two_stage", label: "Two-stage sampling" },
    ],
  },
  {
    id: "validation",
    label: "Validation",
    groupTitle: "Advanced",
    Component: ValidationSection,
    fields: [
      { id: "training.validate_every_n_steps", label: "Validate every N steps" },
      { id: "training.validate_every_n_epochs", label: "Validate every N epochs" },
    ],
  },
  {
    id: "memory-vram",
    label: "Memory & VRAM",
    groupTitle: "Advanced",
    parentLabel: "Memory & performance",
    Component: MemoryVramSection,
    fields: [
      { id: "training.gradient_checkpointing", label: "Gradient checkpointing" },
      { id: "training.gradient_checkpointing_cpu_offload", label: "Gradient ckpt CPU offload" },
      { id: "training.blocks_to_swap", label: "Blocks to swap" },
      { id: "training.use_pinned_memory_for_block_swap", label: "Pinned memory for block swap" },
      { id: "training.img_in_txt_in_offloading", label: "Offload img_in / txt_in" },
    ],
  },
  {
    id: "memory-quant",
    label: "Quantization",
    groupTitle: "Advanced",
    parentLabel: "Memory & performance",
    Component: MemoryQuantSection,
    fields: [
      { id: "training.fp8_base", label: "FP8 base" },
      { id: "training.fp8_scaled", label: "FP8 scaled" },
      { id: "training.fp8_w8a8", label: "FP8 W8A8" },
      { id: "training.w8a8_mode", label: "W8A8 mode" },
      { id: "training.nf4_base", label: "NF4 base" },
      { id: "training.nf4_block_size", label: "NF4 block size" },
      { id: "training.loftq_init", label: "LoftQ init" },
      { id: "training.loftq_iters", label: "LoftQ iters" },
      { id: "training.awq_calibration", label: "AWQ calibration" },
      { id: "training.quantize_device", label: "Quantize device" },
    ],
  },
  {
    id: "memory-attn",
    label: "Attention",
    groupTitle: "Advanced",
    parentLabel: "Memory & performance",
    Component: MemoryAttnSection,
    fields: [
      { id: "training.flash_attn", label: "Flash attention" },
      { id: "training.sdpa", label: "SDPA" },
      { id: "training.sage_attn", label: "Sage attention" },
      { id: "training.xformers", label: "xFormers" },
      { id: "training.split_attn_target", label: "Split attn target" },
      { id: "training.split_attn_mode", label: "Split attn mode" },
      { id: "training.ffn_chunk_size", label: "FFN chunk size" },
    ],
  },
  {
    id: "memory-compile",
    label: "torch.compile",
    groupTitle: "Advanced",
    parentLabel: "Memory & performance",
    Component: MemoryCompileSection,
    toggleField: "training.compile",
    fields: [
      { id: "training.compile", label: "Enable torch.compile" },
      { id: "training.compile_backend", label: "Compile backend" },
      { id: "training.compile_mode", label: "Compile mode" },
      { id: "training.compile_dynamic", label: "Dynamic shapes" },
      { id: "training.compile_fullgraph", label: "Full graph" },
    ],
  },
  {
    id: "memory-gemma",
    label: "Gemma quantization",
    groupTitle: "Advanced",
    parentLabel: "Memory & performance",
    Component: MemoryGemmaSection,
    fields: [
      { id: "training.gemma_load_in_8bit", label: "Gemma load in 8bit" },
      { id: "training.gemma_load_in_4bit", label: "Gemma load in 4bit" },
      { id: "training.gemma_bnb_4bit_disable_double_quant", label: "Disable double quant" },
    ],
  },

  // ─── Research ────────────────────────────────────────────────
  {
    id: "research-crepa",
    label: "CREPA",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchCrepaSection,
    toggleField: "training.crepa",
    fields: [
      { id: "training.crepa", label: "Enable CREPA" },
      { id: "training.crepa_mode", label: "CREPA mode" },
      { id: "training.crepa_dino_model", label: "CREPA DINO model" },
      { id: "training.crepa_lambda", label: "CREPA lambda" },
      { id: "training.crepa_tau", label: "CREPA tau" },
      { id: "training.crepa_schedule", label: "CREPA schedule" },
    ],
  },
  {
    id: "research-self-flow",
    label: "Self-Flow",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchSelfFlowSection,
    toggleField: "training.self_flow",
    fields: [
      { id: "training.self_flow", label: "Enable Self-Flow" },
      { id: "training.self_flow_teacher_mode", label: "Self-Flow teacher mode" },
      { id: "training.self_flow_lambda", label: "Self-Flow lambda" },
      { id: "training.self_flow_dual_timestep", label: "Self-Flow dual timestep" },
      { id: "training.self_flow_temporal_mode", label: "Self-Flow temporal mode" },
    ],
  },
  {
    id: "research-hfato",
    label: "HFATO",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchHfatoSection,
    toggleField: "training.hfato",
    fields: [
      { id: "training.hfato", label: "Enable HFATO" },
      { id: "training.hfato_scale_factor", label: "HFATO scale factor" },
      { id: "training.hfato_interpolation", label: "HFATO interpolation" },
      { id: "training.hfato_probability", label: "HFATO probability" },
    ],
  },
  {
    id: "research-preservation",
    label: "Preservation",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchPreservationSection,
    toggleField: "training.blank_preservation",
    fields: [
      { id: "training.blank_preservation", label: "Blank preservation" },
      { id: "training.dop", label: "DOP (class preservation)" },
      { id: "training.prior_divergence", label: "Prior divergence" },
    ],
  },
  {
    id: "research-tarp",
    label: "TARP / DCR",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchTarpSection,
    toggleField: "training.tarp",
    fields: [
      { id: "training.tarp", label: "Enable TARP" },
      { id: "training.dcr", label: "Enable DCR" },
    ],
  },
  {
    id: "research-audio-loss",
    label: "Audio loss balance",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchAudioLossSection,
    fields: [
      { id: "training.audio_loss_balance_mode", label: "Audio loss balance mode" },
      { id: "training.video_loss_weight", label: "Video loss weight" },
      { id: "training.audio_loss_weight", label: "Audio loss weight" },
    ],
  },
  {
    id: "research-audio-metrics",
    label: "Audio metrics",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchAudioMetricsSection,
    toggleField: "training.audio_metrics",
    fields: [
      { id: "training.audio_metrics", label: "Enable audio metrics" },
      { id: "training.audio_metrics_mel_metrics", label: "Mel-space metrics" },
      { id: "training.audio_metrics_clap_similarity", label: "CLAP similarity" },
    ],
  },
  {
    id: "research-modality",
    label: "Modality freezer",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchModalitySection,
    fields: [
      { id: "training.modality_freeze_check_interval", label: "Modality freezer interval" },
      { id: "training.modality_freeze_ratio_threshold", label: "Modality freeze ratio threshold" },
    ],
  },
  {
    id: "research-cts",
    label: "Cross-task synergy",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchCtsSection,
    fields: [
      { id: "training.cts_lambda_video_driven", label: "Video-driven lambda" },
      { id: "training.cts_lambda_audio_driven", label: "Audio-driven lambda" },
    ],
  },
  {
    id: "research-audio-sup",
    label: "Audio supervision",
    groupTitle: "Research",
    parentLabel: "Research features",
    Component: ResearchAudioSupSection,
    fields: [
      { id: "training.audio_supervision_mode", label: "Audio supervision mode" },
      { id: "training.audio_supervision_warmup_steps", label: "Audio supervision warmup steps" },
    ],
  },
];

const GROUP_ORDER: GroupTitle[] = ["Essentials", "Advanced", "Research"];

const ACTIVE_TAB_STORAGE_KEY = "ltx2-training-active-tab";

/**
 * The full training hyperparameter page: sticky left sidebar with tabs,
 * fade-swapping content area, and a persistent right action rail.
 * Each sidebar leaf renders ONLY its own fields — no infinite scroll.
 */
export function HyperparameterPage() {
  const { data: project } = useProject();
  const updateProject = useUpdateProject();

  const methods = useForm<Record<string, unknown>>({
    defaultValues: (project?.config as Record<string, unknown> | undefined) ?? {},
    mode: "onChange",
  });

  useEffect(() => {
    if (project?.config) methods.reset(project.config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.config]);

  const isDirty = methods.formState.isDirty;

  const onSubmit = methods.handleSubmit(async (data) => {
    try {
      await updateProject.mutateAsync(data);
      toast.success("Project saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  });

  if (!project?.loaded || !project.config) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Load a project on the Data tab to edit hyperparameters.
        </div>
      </div>
    );
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} className="flex h-full">
        <HyperparameterShell isDirty={isDirty} isSaving={updateProject.isPending} />
      </form>
    </FormProvider>
  );
}

function HyperparameterShell({
  isDirty,
  isSaving,
}: {
  isDirty: boolean;
  isSaving: boolean;
}) {
  const showAdvanced = useUIStore((s) => s.showAdvancedTraining);

  // Render two completely separate sub-components based on mode. Each one
  // has its own (stable) set of hooks — flipping `showAdvanced` unmounts
  // one and mounts the other, which is fine. An earlier version did a
  // conditional `return` inside this same component before later hook
  // calls, which violated the Rules of Hooks (React error #310).
  if (showAdvanced) {
    return <AdvancedShell isDirty={isDirty} isSaving={isSaving} />;
  }
  return <EssentialsShell isDirty={isDirty} isSaving={isSaving} />;
}

function EssentialsShell({
  isDirty,
  isSaving,
}: {
  isDirty: boolean;
  isSaving: boolean;
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <EssentialsGrid />
      </div>
      <TrainingActionRail isDirty={isDirty} isSaving={isSaving} />
    </>
  );
}

function AdvancedShell({
  isDirty,
  isSaving,
}: {
  isDirty: boolean;
  isSaving: boolean;
}) {
  const visibleSections = SECTIONS;

  const [activeId, setActiveId] = useState<string>(() => {
    if (typeof window === "undefined") return SECTIONS[0]!.id;
    const saved = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (saved && SECTIONS.some((s) => s.id === saved)) return saved;
    return SECTIONS[0]!.id;
  });
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeId);
  }, [activeId]);

  // Watch every toggle field so sidebar dots update live
  const toggleFieldNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of SECTIONS) if (s.toggleField) names.add(s.toggleField);
    return Array.from(names);
  }, []);
  const toggleValues = useWatch({ name: toggleFieldNames }) as unknown[];
  const toggleMap = useMemo(() => {
    const m = new Map<string, boolean>();
    toggleFieldNames.forEach((name, i) => m.set(name, Boolean(toggleValues?.[i])));
    return m;
  }, [toggleFieldNames, toggleValues]);

  // Build sidebar groups from the visible-sections list.
  const navGroups: SectionNavGroup[] = useMemo(() => {
    return GROUP_ORDER.map<SectionNavGroup>((title) => ({
      title,
      items: visibleSections.filter((s) => s.groupTitle === title).map<SectionNavItem>((s) => ({
        id: s.id,
        label: s.label,
        parentLabel: s.parentLabel,
        isOn: s.toggleField ? toggleMap.get(s.toggleField) ?? false : undefined,
      })),
    })).filter((g) => g.items.length > 0);
  }, [toggleMap, visibleSections]);

  // Fuzzy search across all field labels.
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const matches: { id: string; label: string; sectionId: string; sectionLabel: string }[] = [];
    for (const section of visibleSections) {
      for (const field of section.fields) {
        if (field.label.toLowerCase().includes(q) || field.id.toLowerCase().includes(q)) {
          matches.push({
            id: field.id,
            label: field.label,
            sectionId: section.id,
            sectionLabel: section.label,
          });
        }
      }
    }
    return matches.slice(0, 50);
  }, [searchQuery, visibleSections]);

  const handleNavigate = (sectionId: string, fieldId?: string) => {
    setActiveId(sectionId);
    // After the new section mounts, briefly highlight the matching field
    if (fieldId) {
      setTimeout(() => {
        const fieldEl = document.querySelector(`[data-field-id="${CSS.escape(fieldId)}"]`);
        if (fieldEl instanceof HTMLElement) {
          fieldEl.scrollIntoView({ behavior: "smooth", block: "center" });
          fieldEl.classList.add("ring-2", "ring-ring", "ring-offset-2", "ring-offset-background", "rounded");
          setTimeout(() => {
            fieldEl.classList.remove(
              "ring-2", "ring-ring", "ring-offset-2", "ring-offset-background", "rounded",
            );
          }, 1500);
        }
      }, 200);
    }
  };

  const activeSection =
    visibleSections.find((s) => s.id === activeId) ?? visibleSections[0] ?? SECTIONS[0]!;

  return (
    <>
      <HyperparameterSidebar
        groups={navGroups}
        activeId={activeId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchResults={searchResults}
        onResultClick={handleNavigate}
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl px-8 pt-6 pb-32">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
            >
              <SectionHeader
                label={activeSection.label}
                parent={activeSection.parentLabel}
                group={activeSection.groupTitle}
              />
              <activeSection.Component />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <TrainingActionRail isDirty={isDirty} isSaving={isSaving} />
    </>
  );
}

function SectionHeader({
  label,
  parent,
  group,
}: {
  label: string;
  parent?: string;
  group: GroupTitle;
}) {
  const groupColor = {
    Essentials: "text-[hsl(var(--status-success))]",
    Advanced: "text-[hsl(var(--status-warning))]",
    Research: "text-muted-foreground",
  }[group];

  return (
    <div className="mb-6 flex items-baseline justify-between border-b border-border pb-3">
      <div>
        {parent && (
          <div className="mb-0.5 text-xs text-muted-foreground">{parent}</div>
        )}
        <h2 className="text-xl font-semibold tracking-tight">{label}</h2>
      </div>
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${groupColor}`}>
        {group}
      </span>
    </div>
  );
}
