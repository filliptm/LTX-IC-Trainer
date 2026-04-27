"""Architecture detection and configuration for LTX-2 network modules (LoHa, LoKr, etc.)."""

import logging

logger = logging.getLogger(__name__)


def detect_arch_config(unet):
    """Detect architecture from model structure.

    Returns: (target_replace_modules, default_exclude_patterns)

    After the LTX2-only strip-down this function only recognises LTX-2 models.
    """
    module_class_names = set()
    for module in unet.modules():
        module_class_names.add(type(module).__name__)

    if "LTX2Wrapper" in module_class_names or "LTXAVModel" in module_class_names or "LTXVideoOnlyModel" in module_class_names:
        from .lora_ltx2 import LTX2_TARGET_REPLACE_MODULES

        return LTX2_TARGET_REPLACE_MODULES, [
            r".*text_embedding_projection\.aggregate_embed.*",
            r".*text_embedding_projection\.video_aggregate_embed.*",
            r".*text_embedding_projection\.audio_aggregate_embed.*",
            r".*embeddings_connector\..*",
            r".*audio_embeddings_connector\..*",
        ]

    raise ValueError(
        f"Cannot auto-detect LTX-2 architecture. Module classes found: {sorted(module_class_names)}"
    )
