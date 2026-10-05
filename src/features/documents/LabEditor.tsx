import { useState } from 'react';
import { View } from 'react-native';
import { ChoiceChips } from '../../components/ChoiceChips';
import { DateField } from '../../components/DateField';
import { Sheet } from '../../components/Sheet';
import { Button, TextField, AppText, commonStyles } from '../../components/ui';
import { isLabResult, labCategories, LabResult, labTemplates } from '../../domain/medical';
import { useApp } from '../../state/AppState';
import { colors } from '../../theme';
import { AttachmentField } from './AttachmentField';
import { AttachmentDraft, persistAttachmentChange, removeAttachment } from './files';

export function LabEditor({
  result,
  onClose,
  notify,
}: {
  result?: LabResult;
  onClose: () => void;
  notify: (text: string) => void;
}) {
  const { today, update } = useApp();
  const [form, setForm] = useState<LabResult>(
    result || {
      id: `lab-${Date.now()}`,
      title: '',
      date: today,
      value: '',
      unit: '',
      reference: '',
      category: 'hormones',
      origin: 'manual',
    },
  );
  const [attachment, setAttachment] = useState<AttachmentDraft | undefined>(result?.attachment);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const patch = (values: Partial<LabResult>) => setForm((current) => ({ ...current, ...values }));

  function save() {
    const next: LabResult = {
      ...form,
      title: form.title.trim(),
      value: form.value.trim(),
      unit: form.unit.trim(),
      reference: form.reference.trim(),
      laboratory: form.laboratory?.trim(),
      attachment: undefined,
      origin: 'manual',
    };
    if (!isLabResult(next) || next.date > today) {
      setError('Укажите название, результат и прошедшую дату или сегодня.');
      return;
    }
    try {
      const warning = persistAttachmentChange(result?.attachment, attachment, (file) =>
        update((data) => ({
          ...data,
          labs: [{ ...next, attachment: file }, ...data.labs.filter(({ id }) => id !== next.id)],
        })),
      );
      notify(warning || 'Анализ сохранён');
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось сохранить анализ.');
    }
  }

  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (!update((data) => ({ ...data, labs: data.labs.filter(({ id }) => id !== result?.id) }))) {
      setError('Не удалось изменить записи.');
      return;
    }
    try {
      removeAttachment(result?.attachment);
      notify('Анализ удалён');
    } catch {
      notify('Запись удалена, но копию файла удалить не удалось.');
    }
    onClose();
  }

  return (
    <Sheet
      title={result ? 'Результат анализа' : 'Добавить анализ'}
      onClose={onClose}
      footer={<Button title="Сохранить анализ" icon="check" onPress={save} />}
    >
      <AppText style={[commonStyles.label, { marginTop: 0 }]}>Быстрый выбор</AppText>
      <ChoiceChips
        options={labTemplates.map(({ title }) => ({ id: title, label: title }))}
        value={form.title}
        onChange={(title) => {
          const template = labTemplates.find((item) => item.title === title);
          if (template) patch(template);
        }}
      />
      <TextField
        label="Название анализа"
        value={form.title}
        onChangeText={(title) => patch({ title })}
        maxLength={80}
        placeholder="Выберите выше или введите своё"
      />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField
            label="Результат"
            value={form.value}
            onChangeText={(value) => patch({ value })}
            maxLength={80}
            placeholder="Число или текст"
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField
            label="Единицы"
            value={form.unit}
            onChangeText={(unit) => patch({ unit })}
            maxLength={30}
            placeholder="Как в бланке"
          />
        </View>
      </View>
      <DateField
        label="Дата анализа"
        value={form.date}
        today={today}
        onChange={(date) => patch({ date })}
      />
      <AppText style={commonStyles.label}>Раздел</AppText>
      <ChoiceChips
        options={labCategories}
        value={form.category}
        onChange={(category) => patch({ category })}
      />
      <TextField
        label="Референс из бланка · необязательно"
        value={form.reference}
        onChangeText={(reference) => patch({ reference })}
        maxLength={100}
        placeholder="Например: 0,4–4,0 или < 5"
      />
      <AppText muted style={{ fontSize: 12, lineHeight: 18, marginTop: 8 }}>
        Введите один подходящий вам интервал в тех же единицах, что и результат. Помощник не
        выбирает референс по возрасту, беременности или фазе цикла.
      </AppText>
      <TextField
        label="Лаборатория · для сравнения результатов"
        value={form.laboratory || ''}
        onChangeText={(laboratory) => patch({ laboratory })}
        maxLength={80}
        placeholder="Название из бланка · необязательно"
      />
      <AttachmentField value={attachment} onChange={setAttachment} />
      {!!error && (
        <AppText accessibilityRole="alert" style={{ color: colors.redDark, marginTop: 14 }}>
          {error}
        </AppText>
      )}
      {result && (
        <Button
          secondary
          icon="trash"
          title={confirmDelete ? 'Подтвердить удаление анализа' : 'Удалить анализ'}
          onPress={remove}
          style={{ marginTop: 18 }}
        />
      )}
    </Sheet>
  );
}
