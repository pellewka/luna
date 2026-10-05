from __future__ import annotations

from collections import Counter
from datetime import date, timedelta
from math import floor
from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

if TYPE_CHECKING:
    from .knowledge import Article

Ingredient = Literal["unknown", "spironolactone", "risperidone", "levonorgestrel_ec"]
DRUG_SOURCES = {
    "spironolactone": "drug-spironolactone",
    "risperidone": "drug-risperidone",
    "levonorgestrel_ec": "drug-levonorgestrel-ec",
}
DRUG_NAMES = {
    "spironolactone": ("спиронолактон", "spironolactone", "верошпирон"),
    "risperidone": ("рисперидон", "risperidone", "рисполепт"),
    "levonorgestrel_ec": ("левоноргестрел", "levonorgestrel"),
}


def mentioned_drug_sources(question: str) -> set[str]:
    return {
        DRUG_SOURCES[ingredient]
        for ingredient, names in DRUG_NAMES.items()
        if any(name in question.lower() for name in names)
    }


class PeriodRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: date
    end: date


class SymptomRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: date
    symptoms: list[str] = Field(max_length=12)
    intensity: int = Field(ge=0, le=3)

    @model_validator(mode="after")
    def valid_names(self):
        if any(len(name) > 80 for name in self.symptoms):
            raise ValueError("Symptom name is too long")
        return self


class MedicationRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=80)
    ingredient: Ingredient = "unknown"
    start: date
    end: date | None = None


class DiaryContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    as_of: date
    periods: list[PeriodRecord] = Field(default_factory=list, max_length=7)
    symptoms: list[SymptomRecord] = Field(default_factory=list, max_length=30)
    medications: list[MedicationRecord] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_dates(self):
        periods = sorted(self.periods, key=lambda item: item.start)
        for index, period in enumerate(periods):
            if period.end < period.start or period.end > self.as_of:
                raise ValueError("Invalid period dates")
            if index and period.start <= periods[index - 1].end:
                raise ValueError("Overlapping period records")
        for medication in self.medications:
            if medication.start > self.as_of or (
                medication.end and not medication.start <= medication.end <= self.as_of
            ):
                raise ValueError("Invalid medication dates")
        if any(item.date > self.as_of for item in self.symptoms):
            raise ValueError("Symptoms cannot be in the future")
        return self


def format_date(value: date) -> str:
    return value.strftime("%d.%m.%Y")


def recent_medications(diary: DiaryContext, question: str) -> list[MedicationRecord]:
    named = question.lower()
    return sorted(
        diary.medications,
        key=lambda item: (
            item.name.lower() in named
            or any(word in named for word in DRUG_NAMES.get(item.ingredient, ())),
            item.start,
        ),
        reverse=True,
    )[:3]


def medication_sources(diary: DiaryContext, question: str) -> list[str]:
    return list(
        dict.fromkeys(
            DRUG_SOURCES[item.ingredient]
            for item in recent_medications(diary, question)
            if item.ingredient in DRUG_SOURCES
        )
    )


def describe_diary(diary: DiaryContext, question: str, articles: list[Article]) -> str:
    """Dates are calculated by code; the model never decides whether a delay exists."""
    lines = ["По вашим записям:"]
    periods = sorted(diary.periods, key=lambda item: item.start)
    expected = None
    if periods:
        last = periods[-1].start
        day = (diary.as_of - last).days + 1
        lines.append(f"Последнее отмеченное начало — {format_date(last)}; день цикла — {day}.")
        intervals = [(right.start - left.start).days for left, right in zip(periods, periods[1:])]
        if len(intervals) >= 2:
            average = floor(sum(intervals) / len(intervals) + 0.5)
            expected = last + timedelta(days=average)
            lines.append(
                f"По {len(intervals)} завершённым интервалам: среднее {average} дней, диапазон {min(intervals)}–{max(intervals)}."
            )
            elapsed = (diary.as_of - expected).days
            if elapsed > 0:
                lines.append(
                    f"Расчётная дата {format_date(expected)} прошла {elapsed} дн. назад. Это отклонение от прогноза, а не установленная задержка: проверьте, не пропущена ли запись."
                )
            else:
                lines.append(
                    f"Расчётный следующий старт — {format_date(expected)}; по этому расчёту дата ещё не прошла."
                )
        else:
            lines.append(
                "Для сравнения с привычной длиной нужны хотя бы три отмеченных начала. По короткой истории причину изменений оценить нельзя."
            )
    else:
        lines.append(
            "Начало месячных не отмечено — день цикла и отклонение от привычной длины пока не рассчитать."
        )

    symptoms = Counter(name for item in diary.symptoms for name in set(item.symptoms))
    if symptoms:
        text = ", ".join(f"{name}: {count} записей" for name, count in symptoms.most_common(3))
        lines.append("Чаще отмечались: " + text + ".")

    sources = {article.id: article for article in articles}
    medications = recent_medications(diary, question)
    if medications:
        lines.append("\nЛекарства — сопоставление дат:")
        for medication in medications:
            timing = f"{medication.name}: начало {format_date(medication.start)}"
            if medication.end:
                timing += f", окончание {format_date(medication.end)}"
            timing += "."
            if expected and expected < diary.as_of and medication.start > expected:
                timing += " Приём начат уже после расчётной даты; такая хронология не поддерживает связь с началом отклонения."
            elif expected and medication.start <= expected:
                timing += (
                    " Приём начат до расчётной даты. Совпадение по времени не доказывает причину."
                )
            source = sources.get(DRUG_SOURCES.get(medication.ingredient, ""))
            timing += " " + (
                f"{source.title}: {source.text}"
                if source
                else "Для выбранного средства в базе нет подтверждённой справки о влиянии на цикл. Это не означает отсутствия такого влияния."
            )
            lines.append(timing)
        if len(diary.medications) > 3:
            lines.append(
                "В кратком разборе показаны три препарата; для другого укажите его название в вопросе."
            )
    else:
        lines.append("Лекарства не отмечены. Для сопоставления добавьте название и даты приёма.")

    lines.append(
        "\nПо дневнику нельзя установить причину. При возможности беременности учитывают и её; изменения цикла обсудите с врачом. Самостоятельно не отменяйте назначенное лечение."
    )
    return "\n".join(lines)
