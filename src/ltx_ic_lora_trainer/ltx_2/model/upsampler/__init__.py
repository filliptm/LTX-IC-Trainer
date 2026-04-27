"""Latent upsampler model components."""
from ltx_ic_lora_trainer.ltx_2.model.upsampler.model import LatentUpsampler, upsample_video
from ltx_ic_lora_trainer.ltx_2.model.upsampler.model_configurator import LatentUpsamplerConfigurator

__all__ = [
    "LatentUpsampler",
    "LatentUpsamplerConfigurator",
    "upsample_video",
]
