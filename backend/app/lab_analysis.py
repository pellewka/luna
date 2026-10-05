"""Compare entered results with their own reference; never infer a diagnosis."""

import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .diary import DiaryContext

NUMBER = r"[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)"
LAB_GUIDES = {
    "ттг": "lab-tsh",
    "tsh": "lab-tsh",
    "тиреотропный гормон": "lab-tsh",
    "пролактин": "lab-prolactin",
    "prolactin": "lab-prolactin",
    "прогестерон": "lab-progesterone",
    "progesterone": "lab-progesterone",
    "ферритин": "lab-ferritin",
    "ferritin": "lab-ferritin",
}


class LabRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=80)
    date: date
    value: str = Field(min_length=1, max_length=80)
    unit: str = Field(default="", max_length=30)
    reference: str = Field(default="", max_length=100)
    laboratory: str = Field(default="", max_length=80)
    category: Literal["hormones", "general", "biochemistry", "other"]
    origin: Literal["manual"]


class LabContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    as_of: date
    results: list[LabRecord] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_dates(self):
        earliest = self.as_of - timedelta(days=365)
        if any(not earliest <= result.date <= self.as_of for result in self.results):
            raise ValueError("Only results from the preceding year may be shared")
        return self


@dataclass(frozen=True)
class ReferenceRange:
    lower: Decimal | None = None
    upper: Decimal | None = None
    lower_inclusive: bool = True
    upper_inclusive: bool = True

    def describe(self, value: Decimal) -> str:
        if self.lower is not None and (
            value < self.lower or (value == self.lower and not self.lower_inclusive)
        ):
            return "ниже введённого референса"
        if self.upper is not None and (
            value > self.upper or (value == self.upper and not self.upper_inclusive)
        ):
            return "выше введённого референса"
        return "в пределах введённого референса"


def parse_number(value: str) -> Decimal | None:
    value = value.strip()
    if not re.fullmatch(NUMBER, value):
        return None
    return Decimal(value.replace(",", "."))


def parse_reference(value: str) -> ReferenceRange | None:
    interval = re.fullmatch(rf"\s*({NUMBER})\s*[-–—]\s*({NUMBER})\s*", value)
    if interval:
        lower, upper = (parse_number(part) for part in interval.groups())
        if lower is not None and upper is not None and lower <= upper:
            return ReferenceRange(lower, upper)
        return None
    boundary = re.fullmatch(rf"\s*(<=|>=|<|>|≤|≥)\s*({NUMBER})\s*", value)
    if not boundary:
        return None
    operator, number = boundary.groups()
    threshold = parse_number(number)
    if operator in {"<", "<=", "≤"}:
        return ReferenceRange(upper=threshold, upper_inclusive=operator != "<")
    return ReferenceRange(lower=threshold, lower_inclusive=operator != ">")


def normalized(value: str) -> str:
    return " ".join(value.casefold().replace("ё", "е").split())


def cycle_day_on(sample_date: date, diary: DiaryContext | None) -> int | None:
    if diary is None:
        return None
    starts = [period.start for period in diary.periods if period.start <= sample_date]
    return (sample_date - max(starts)).days + 1 if starts else None


def selected_results(context: LabContext, question: str) -> list[LabRecord]:
    latest: dict[str, LabRecord] = {}
    for result in sorted(context.results, key=lambda item: item.date, reverse=True):
        latest.setdefault(normalized(result.title), result)
    question = normalized(question)
    return sorted(
        latest.values(),
        key=lambda item: (normalized(item.title) in question, item.date),
        reverse=True,
    )[:8]


def lab_source_ids(context: LabContext, question: str) -> list[str]:
    return list(
        dict.fromkeys(
            LAB_GUIDES[normalized(result.title)]
            for result in selected_results(context, question)
            if normalized(result.title) in LAB_GUIDES
        )
    )[:2]


def describe_comparison(current: LabRecord, previous: LabRecord) -> str:
    if current.date == previous.date:
        return "Есть несколько записей за одну дату; порядок измерений неизвестен."
    if current.category == "hormones" or previous.category == "hormones":
        return "Динамику гормонов автоматически не оцениваю: нужны условия сдачи и контекст цикла."
    if not current.laboratory or not previous.laboratory:
        return "Для сопоставления с прошлой записью укажите лабораторию в обоих результатах."
    if normalized(current.laboratory) != normalized(previous.laboratory):
        return "Лаборатории различаются; численную динамику не рассчитываю."
    # Unit case is significant: for example, m and M must not be conflated.
    if not current.unit or current.unit.strip() != previous.unit.strip():
        return "Единицы отличаются или не указаны; результаты численно не сопоставляю."
    reference = parse_reference(current.reference)
    if reference is None or reference != parse_reference(previous.reference):
        return "Референсы отличаются или не распознаны; динамику не рассчитываю."
    current_value = parse_number(current.value)
    previous_value = parse_number(previous.value)
    if current_value is None or previous_value is None:
        return "Один из результатов не является точным числом; динамику не рассчитываю."
    difference = current_value - previous_value
    return (
        f"Предыдущий результат {previous.date:%d.%m.%Y}: {previous.value} {previous.unit}. "
        f"Разница: {difference:+f} {current.unit}. Это изменение числа, не оценка улучшения; "
        "нужно проверить одинаковые метод и условия сдачи."
    )


def describe_labs(context: LabContext, diary: DiaryContext | None, question: str) -> str:
    if not context.results:
        return "В разделе «Анализы» нет вручную введённых результатов за последний год."
    groups: dict[str, list[LabRecord]] = defaultdict(list)
    for result in sorted(context.results, key=lambda item: item.date, reverse=True):
        groups[normalized(result.title)].append(result)
    selected = selected_results(context, question)
    lines = [
        f"По вашим анализам: {len(context.results)} записей за последний год. "
        f"Ниже последние результаты по {len(selected)} показателям; "
        "названные в вопросе показаны первыми.",
        "Сравниваю только с референсом, который вы ввели из своего бланка, "
        "в тех же единицах. Подходит ли этот интервал лично вам, я не определяю.",
    ]
    for result in selected:
        value = parse_number(result.value)
        reference = parse_reference(result.reference)
        description = f"{result.title} · {result.date:%d.%m.%Y}: {result.value} {result.unit}."
        if value is None:
            description += " Текстовый результат или значение с ограничением: численно не оцениваю."
        elif not result.unit:
            description += " Не указаны единицы; сравнение с референсом не выполняю."
        elif not result.reference:
            description += (
                " Нет референса из бланка; определить положение относительно него нельзя."
            )
        elif reference is None:
            description += " Референс не распознан. Введите один диапазон или границу из бланка."
        else:
            description += f" {reference.describe(value).capitalize()} ({result.reference})."
        cycle_day = cycle_day_on(result.date, diary)
        if cycle_day is not None:
            description += f" По последней записи месячных — день цикла {cycle_day}."
        elif result.category == "hormones":
            description += " День цикла на дату сдачи неизвестен."
        group = groups[normalized(result.title)]
        if len(group) > 1:
            description += " " + describe_comparison(result, group[1])
        lines.append(description)
    if diary is not None:
        lines.append(
            "День цикла рассчитан по записанным началам месячных; пропуски записей меняют расчёт. "
            "Календарная дата не подтверждает фазу цикла или овуляцию."
        )
    lines.append(
        "Значение вне референса само по себе не устанавливает болезнь, а внутри — не исключает её. "
        "По этим данным нельзя доказать, что препарат вызвал изменение анализа или задержку. "
        "На приёме обсудите применимость референса, условия сдачи и принимаемые препараты."
    )
    return "\n\n".join(lines)
