import re

from .schemas import GroundedAnswer


def validate_answer(
    answer: GroundedAnswer, source_ids: set[str], *, has_labs: bool = False
) -> None:
    if any(identifier not in source_ids for identifier in answer.source_ids):
        raise ValueError("Model cited an unknown source")
    if re.search(
        r"https?://|\d+\s*(?:мг|мкг|mg|таблет)|у вас (?:точно|диагноз)|вам нужно принимать|задержка (?:вызвана|обусловлена)|точно из-за|причина вашей задержки",
        answer.answer,
        re.I,
    ):
        raise ValueError("Answer failed a conservative output check")
    if has_labs and re.search(r"(?<!\w)\d+(?:[.,]\d+)?(?!\w)", answer.answer):
        raise ValueError("Lab numbers must come from the calculated summary only")
