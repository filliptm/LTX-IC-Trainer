"""Extract LTX-2 VAE decoder + statistics into a small standalone safetensors file.

The main LTX-2 checkpoint is 46GB; reloading it for VAE during training-time sampling
is what triggers the VRAM-fragmentation access violation. Extracting the VAE once
into a tiny standalone file lets sampling load the VAE cheaply via --vae path.
"""

import argparse
from safetensors import safe_open
from safetensors.torch import save_file


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--checkpoint", required=True, help="Path to LTX-2 full checkpoint")
    parser.add_argument("--output", required=True, help="Output VAE safetensors path")
    args = parser.parse_args()

    tensors = {}
    kept = 0
    skipped = 0
    total_bytes = 0
    metadata = None

    with safe_open(args.checkpoint, framework="pt") as f:
        metadata = f.metadata()
        for key in f.keys():
            if key.startswith("vae.decoder.") or key.startswith("vae.per_channel_statistics."):
                tensor = f.get_tensor(key)
                tensors[key] = tensor
                kept += 1
                total_bytes += tensor.numel() * tensor.element_size()
            else:
                skipped += 1

    print(f"Kept {kept} keys, skipped {skipped}")
    print(f"Total VAE size: {total_bytes / 1e9:.2f} GB")
    print(f"Metadata keys: {list(metadata.keys()) if metadata else 'None'}")
    print(f"Saving to {args.output}")
    save_file(tensors, args.output, metadata=metadata)
    print("Done.")


if __name__ == "__main__":
    main()
