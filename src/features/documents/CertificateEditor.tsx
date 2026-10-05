import { useState } from 'react';
import { ChoiceChips } from '../../components/ChoiceChips';
import { DateField } from '../../components/DateField';
import { Sheet } from '../../components/Sheet';
import { Button, TextField, AppText } from '../../components/ui';
import { Certificate, isCertificate } from '../../domain/medical';
import { useApp } from '../../state/AppState';
import { colors } from '../../theme';
import { AttachmentField } from './AttachmentField';
import { AttachmentDraft, persistAttachmentChange, removeAttachment } from './files';

export function CertificateEditor({
  certificate,
  onClose,
  notify,
}: {
  certificate?: Certificate;
  onClose: () => void;
  notify: (text: string) => void;
}) {
  const { today, update } = useApp();
  const [form, setForm] = useState<Certificate>(
    certificate || {
      id: `certificate-${Date.now()}`,
      title: '',
      clinic: '',
      date: today,
      note: '',
    },
  );
  const [attachment, setAttachment] = useState<AttachmentDraft | undefined>(
    certificate?.attachment,
  );
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const patch = (values: Partial<Certificate>) => setForm((current) => ({ ...current, ...values }));

  function save() {
    const next = {
      ...form,
      title: form.title.trim(),
      clinic: form.clinic.trim(),
      note: form.note.trim(),
      attachment: undefined,
    };
    if (!isCertificate(next) || next.date > today) {
      setError('Укажите название и дату выдачи.');
      return;
    }
    try {
      const warning = persistAttachmentChange(certificate?.attachment, attachment, (file) =>
        update((data) => ({
          ...data,
          certificates: [
            { ...next, attachment: file },
            ...data.certificates.filter(({ id }) => id !== next.id),
          ],
        })),
      );
      notify(warning || 'Справка сохранена');
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось сохранить справку.');
    }
  }
  function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (
      !update((data) => ({
        ...data,
        certificates: data.certificates.filter(({ id }) => id !== certificate?.id),
      }))
    ) {
      setError('Не удалось изменить записи.');
      return;
    }
    try {
      removeAttachment(certificate?.attachment);
      notify('Справка удалена');
    } catch {
      notify('Запись удалена, но копию файла удалить не удалось.');
    }
    onClose();
  }
  return (
    <Sheet
      title={certificate ? 'Справка' : 'Добавить справку'}
      onClose={onClose}
      footer={<Button title="Сохранить справку" icon="check" onPress={save} />}
    >
      <ChoiceChips
        options={['Для учёбы', 'Для работы', 'Заключение врача'].map((title) => ({
          id: title,
          label: title,
        }))}
        value={form.title}
        onChange={(title) => patch({ title })}
      />
      <TextField
        label="Название"
        value={form.title}
        onChangeText={(title) => patch({ title })}
        maxLength={100}
        placeholder="Например, справка для учёбы"
      />
      <DateField
        label="Дата выдачи"
        today={today}
        value={form.date}
        onChange={(date) => patch({ date })}
      />
      <TextField
        label="Клиника · необязательно"
        value={form.clinic}
        onChangeText={(clinic) => patch({ clinic })}
        maxLength={100}
      />
      <AttachmentField value={attachment} onChange={setAttachment} />
      <TextField
        label="Заметка · необязательно"
        value={form.note}
        onChangeText={(note) => patch({ note })}
        maxLength={1000}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 90 }}
      />
      {!!error && (
        <AppText accessibilityRole="alert" style={{ marginTop: 14, color: colors.redDark }}>
          {error}
        </AppText>
      )}
      {certificate && (
        <Button
          title={confirmDelete ? 'Подтвердить удаление справки' : 'Удалить справку'}
          secondary
          icon="trash"
          onPress={remove}
          style={{ marginTop: 18 }}
        />
      )}
    </Sheet>
  );
}
