"""Split five-expression character sheets into individual PNG portraits."""

from pathlib import Path
import sys

from PIL import Image


EMOTIONS = ("normal", "angry", "shocked", "happy", "sad")
SINGLE_PORTRAITS = {"Judik.png", "Judik_turned.png"}


def is_character_sheet(path: Path) -> bool:
    """Return true only for an original five-expression PNG sheet."""

    if path.suffix.lower() != ".png" or path.name in SINGLE_PORTRAITS:
        return False

    return not any(path.stem.lower().endswith(f"_{emotion}") for emotion in EMOTIONS)


def crop_rectangles(width: int, height: int) -> dict[str, tuple[int, int, int, int]]:
    """Describe the three-over-two portrait layout used by the source sheets."""

    halfway_down = height // 2
    first_third = round(width / 3)
    second_third = round((width * 2) / 3)
    halfway_across = width // 2

    return {
        "normal": (0, 0, first_third, halfway_down),
        "angry": (first_third, 0, second_third, halfway_down),
        "shocked": (second_third, 0, width, halfway_down),
        "happy": (0, halfway_down, halfway_across, height),
        "sad": (halfway_across, halfway_down, width, height),
    }


def split_sheet(source_path: Path, output_directory: Path) -> int:
    """Write all five crops for one sheet without overwriting existing files."""

    created_count = 0

    with Image.open(source_path) as source_image:
        if source_image.width != source_image.height:
            print(f"Skipped non-square image: {source_path.name}")
            return created_count

        rectangles = crop_rectangles(source_image.width, source_image.height)
        character_name = source_path.stem.lower()

        for emotion, rectangle in rectangles.items():
            output_path = output_directory / f"{character_name}_{emotion}.png"

            if output_path.exists():
                print(f"Preserved existing file: {output_path.name}")
                continue

            # PNG output keeps the source quality and alpha channel unchanged.
            portrait = source_image.crop(rectangle)
            portrait.save(output_path, format="PNG")
            created_count += 1
            print(f"Created {output_path.name}")

    return created_count


def main() -> None:
    """Split every recognized character sheet in the requested directory."""

    if len(sys.argv) != 3:
        raise SystemExit(
            "Usage: python split_character_sheets.py <source-directory> <output-directory>"
        )

    source_directory = Path(sys.argv[1])
    output_directory = Path(sys.argv[2])
    source_files = sorted(
        (path for path in source_directory.iterdir() if is_character_sheet(path)),
        key=lambda path: path.name.lower(),
    )
    output_directory.mkdir(parents=True, exist_ok=True)
    created_count = sum(
        split_sheet(source_path, output_directory) for source_path in source_files
    )

    print(f"Finished: {created_count} portraits from {len(source_files)} sheets.")


if __name__ == "__main__":
    main()
