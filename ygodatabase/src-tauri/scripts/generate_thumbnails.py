#!/usr/bin/env python3
import argparse
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow not found. Run: pip install Pillow")
    raise SystemExit(1)


def convert_one(src: Path, dst: Path, width: int, quality: int) -> tuple[str, bool, str]:
    try:
        with Image.open(src) as img:
            # Maintain aspect ratio
            orig_w, orig_h = img.size
            height = int(orig_h * width / orig_w)
            img = img.resize((width, height), Image.LANCZOS)
            img.save(dst, "WEBP", quality=quality, method=4)
        return (src.name, True, "")
    except Exception as e:
        return (src.name, False, str(e))


def main():
    script_dir = Path(__file__).parent

    parser = argparse.ArgumentParser(description="Generate WebP thumbnails for card images.")
    parser.add_argument("--img-dir",  default=str(script_dir / "img"),
                        help="Directory containing source JPEGs (default: ./img)")
    parser.add_argument("--out-dir",  default=None,
                        help="Output directory (default: img_thumb next to img-dir)")
    parser.add_argument("--size",     type=int, default=120,
                        help="Thumbnail width in pixels (default: 120)")
    parser.add_argument("--quality",  type=int, default=82,
                        help="WebP quality 1-100 (default: 82)")
    parser.add_argument("--workers",  type=int, default=8,
                        help="Parallel workers (default: 8)")
    parser.add_argument("--force",    action="store_true",
                        help="Regenerate even if thumbnail already exists")
    args = parser.parse_args()

    img_dir  = Path(args.img_dir)
    out_dir  = Path(args.out_dir) if args.out_dir else img_dir.parent / "img_thumb"

    if not img_dir.exists():
        print(f"ERROR: img directory not found at {img_dir}")
        raise SystemExit(1)

    out_dir.mkdir(exist_ok=True)

    # Find all source images (jpg and jpeg)
    sources = sorted(img_dir.glob("*.jpg")) + sorted(img_dir.glob("*.jpeg"))
    if not sources:
        print(f"No JPEGs found in {img_dir}")
        raise SystemExit(1)

    print(f"Found {len(sources)} images in {img_dir}")
    print(f"Output: {out_dir}  |  Size: {args.size}px  |  Quality: {args.quality}  |  Workers: {args.workers}")

    # Build work list — skip already-done unless --force
    work = []
    skipped = 0
    for src in sources:
        dst = out_dir / (src.stem + ".webp")
        if dst.exists() and not args.force:
            skipped += 1
        else:
            work.append((src, dst))

    if skipped:
        print(f"Skipping {skipped} already-converted images (use --force to redo).")
    print(f"Converting {len(work)} images…")

    if not work:
        print("Nothing to do.")
        return

    done = 0
    errors = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(convert_one, src, dst, args.size, args.quality): src
                   for src, dst in work}
        for future in as_completed(futures):
            name, ok, err = future.result()
            done += 1
            if not ok:
                errors.append((name, err))
            if done % 500 == 0 or done == len(work):
                print(f"  {done}/{len(work)} done…")

    if errors:
        print(f"\n{len(errors)} errors:")
        for name, err in errors[:10]:
            print(f"  {name}: {err}")

    # Size comparison
    sample_src  = sources[0]
    sample_dst  = out_dir / (sources[0].stem + ".webp")
    if sample_dst.exists():
        orig_kb  = sample_src.stat().st_size  / 1024
        thumb_kb = sample_dst.stat().st_size  / 1024
        print(f"\nSample size: {orig_kb:.0f}KB → {thumb_kb:.0f}KB "
              f"({100*thumb_kb/orig_kb:.0f}% of original)")

    print(f"\nDone. {len(work) - len(errors)} thumbnails written to {out_dir}")
    print("Next: update DB paths and Tauri allowlist (see README output below).\n")
    print("─" * 60)
    print("In db.rs normalize_img_path(), the frontend already uses")
    print("asset://img/... for full images.")
    print("Thumbnails will be at asset://img_thumb/...webp")
    print("Update CardStub rendering to use imgThumbPath for the grid")
    print("and imgPath for the detail pane.")


if __name__ == "__main__":
    main()