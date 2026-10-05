"""Inference shared by evaluation and the app; MLX is imported only when selected."""

from threading import Event

from .schemas import Usage


def generate_text(
    model, tokenizer, messages: list[dict], stop: Event | None = None
) -> tuple[str, Usage]:
    from mlx_lm import stream_generate
    from mlx_lm.sample_utils import make_sampler

    prompt = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        enable_thinking=False,
        return_dict=False,
    )
    if len(prompt) + 800 > 8192:
        raise ValueError("Контекст слишком большой. Сократите вопрос или начните новый чат.")
    parts = []
    usage = Usage(input_tokens=len(prompt))
    generator = stream_generate(
        model,
        tokenizer,
        prompt,
        max_tokens=800,
        sampler=make_sampler(temp=0.0),
        prefill_step_size=256,
    )
    try:
        for response in generator:
            if stop is not None and stop.is_set():
                raise TimeoutError("Генерация остановлена по тайм-ауту.")
            parts.append(response.text)
            usage.output_tokens = response.generation_tokens
    finally:
        generator.close()
    return "".join(parts).strip(), usage
